const SPREADSHEETS = {
	ub: "1eljby7eGGqhvvfpIpoeRvTBfg6DQ7_QzHEJl4Sz_sq8",
	plus: "1Ogd5Cql3j6lS5r0aE99MDuY7GkxRhg-5onqlmwdoB00",
};

const DEFAULTS = {
	boardTitle: "Score Leaderboard",
	sheetNames: ["Score", "Unofficial Score"],
	sheetLabels: ["Official", "Unofficial"],
	spreadsheetChoice: "ub",
	startRank: 1,
	endRank: 10,
};

const COLUMN_WIDTH_PX = 650;

// benchmark: 10 rows (rank 0-9) at 950px total table height
const BENCHMARK_TOTAL_HEIGHT_PX = 950;
const BENCHMARK_ROW_COUNT = 10;

let state = { ...DEFAULTS, settingsOpen: false };
let rowHeightPx = (BENCHMARK_TOTAL_HEIGHT_PX - 250) / BENCHMARK_ROW_COUNT; // rough initial guess, refined below
let calibrated = false;

// after the first render at the benchmark row count, measure the real
// rendered table height and correct rowHeightPx so it's exact - this
// accounts for border-collapse/box-model quirks a naive estimate misses.
function calibrateRowHeight(columns) {
	if (calibrated) return;

	const rowCount = Math.abs(state.endRank - state.startRank) + 1;
	if (rowCount !== BENCHMARK_ROW_COUNT) return;

	const actualHeight = el("sheets").getBoundingClientRect().height;
	const error = BENCHMARK_TOTAL_HEIGHT_PX - actualHeight;
	rowHeightPx += error / rowCount;
	calibrated = true;

	// TEMP: load the page once with defaults (rank 0-10), open devtools console,
	// copy this number into ROW_HEIGHT_PX below, then delete this whole
	// calibration system (see instructions).
	console.log("CALIBRATED rowHeightPx:", rowHeightPx);

	renderRows(columns);
}

const el = (id) => document.getElementById(id);

function parseList(value, fallback) {
	const values = (value || "").split(",").map((s) => s.trim()).filter(Boolean);
	return values.length ? values : [...fallback];
}

function parseNum(value, fallback) {
	const n = Number.parseInt(value, 10);
	return Number.isNaN(n) ? fallback : n;
}

function parseEntry(row) {
	const cells = row.filter((v) => String(v).trim() !== "");
	if (cells.length >= 2) return { name: String(cells[0]).trim(), score: String(cells[1]).trim() };
	const match = String(cells[0] || "").match(/^(.*?)[\s:,-]+(\d+(?:\.\d+)?)$/);
	return match
		? { name: match[1].trim(), score: match[2].trim() }
		: { name: String(cells[0] || "").trim(), score: "" };
}

async function fetchEntries(spreadsheetId, sheetName) {
	const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tqx=out:json`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);

	const text = await res.text();
	const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
	const rows = (json.table.rows || [])
		.map((r) => (r.c || []).map((c) => c?.f ?? c?.v ?? ""))
		.filter((r) => r.some((v) => String(v).trim() !== ""));

	if (rows.length === 0) throw new Error("No rows found.");
	return rows.map(parseEntry);
}

function renderHeader() {
	el("board-title").textContent = state.boardTitle;
	el("board-title").colSpan = Math.max(1, state.sheetLabels.length);

	const headerRow = el("panel-title-row");
	headerRow.innerHTML = "";
	for (const label of state.sheetLabels) {
		const th = document.createElement("th");
		th.className = "panel-title";
		th.textContent = label;
		headerRow.appendChild(th);
	}

	el("sheets").style.width = `${Math.max(1, state.sheetLabels.length) * COLUMN_WIDTH_PX}px`;
}

function renderRows(columns) {
	const start = Math.min(state.startRank, state.endRank) - 1;
	const end = Math.max(state.startRank, state.endRank) - 1;
	const container = el("leaderboard-rows");
	container.innerHTML = "";

	for (let rank = start; rank <= end; rank += 1) {
		const tr = document.createElement("tr");
		tr.style.height = `${rowHeightPx}px`;

		columns.forEach((col) => {
			const td = document.createElement("td");
			td.className = "panel-body";

			if (col.error) {
				if (rank === start) {
					td.textContent = col.error;
					td.classList.add("error");
				}
			} else {
				const entry = col.entries[rank];
				const left = document.createElement("div");
				left.className = "entry-left";
				left.title = entry?.name || "";
				left.textContent = entry ? `${rank + 1}. ${entry.name}` : `${rank + 1}.`;

				const right = document.createElement("div");
				right.className = "entry-score";
				right.textContent = entry?.score || "";

				const wrapper = document.createElement("div");
				wrapper.className = "entry-row";
				wrapper.append(left, right);
				td.appendChild(wrapper);
			}

			tr.appendChild(td);
		});

		container.appendChild(tr);
	}
}

async function loadAllSheets() {
	renderHeader();
	const spreadsheetId = SPREADSHEETS[state.spreadsheetChoice] || SPREADSHEETS.ub;

	const columns = await Promise.all(
		state.sheetNames.map((name) =>
			fetchEntries(spreadsheetId, name)
				.then((entries) => ({ entries }))
				.catch((err) => ({ error: `Could not load: ${err.message}` }))
		)
	);

	renderRows(columns);
	calibrateRowHeight(columns);
}

// --- config modal ---

function syncConfigForm() {
	el("board-title-input").value = state.boardTitle;
	el("start-rank").value = state.startRank;
	el("end-rank").value = state.endRank;
	el("spreadsheet-choice").value = state.spreadsheetChoice;
	el("sheet-names").value = state.sheetNames.join(", ");
	el("sheet-labels").value = state.sheetLabels.join(", ");
}

function openConfig() {
	syncConfigForm();
	el("config-backdrop").hidden = false;
	el("config-backdrop").classList.add("is-open");
	state.settingsOpen = true;
	setTimeout(() => el("spreadsheet-choice").focus(), 0);
}

function closeConfig() {
	el("config-backdrop").classList.remove("is-open");
	el("config-backdrop").hidden = true;
	state.settingsOpen = false;
}

function applyConfig() {
	state.boardTitle = el("board-title-input").value.trim() || DEFAULTS.boardTitle;
	state.startRank = parseNum(el("start-rank").value, DEFAULTS.startRank);
	state.endRank = parseNum(el("end-rank").value, DEFAULTS.endRank);
	if (state.endRank < state.startRank) [state.startRank, state.endRank] = [state.endRank, state.startRank];

	state.spreadsheetChoice = (el("spreadsheet-choice").value || DEFAULTS.spreadsheetChoice).toLowerCase();
	state.sheetNames = parseList(el("sheet-names").value, DEFAULTS.sheetNames);
	state.sheetLabels = parseList(el("sheet-labels").value, DEFAULTS.sheetLabels);

	// keep labels aligned 1:1 with names
	while (state.sheetLabels.length < state.sheetNames.length) {
		state.sheetLabels.push(state.sheetNames[state.sheetLabels.length]);
	}
	state.sheetLabels.length = state.sheetNames.length;

	closeConfig();
	loadAllSheets();
}

function resetConfig() {
	state = { ...DEFAULTS, settingsOpen: state.settingsOpen };
	syncConfigForm();
}

document.addEventListener("DOMContentLoaded", () => {
	el("config-apply").addEventListener("click", applyConfig);
	el("config-close").addEventListener("click", closeConfig);
	el("config-reset").addEventListener("click", resetConfig);
	el("config-backdrop").addEventListener("click", (e) => e.target === el("config-backdrop") && closeConfig());

	document.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && state.settingsOpen) {
			e.preventDefault();
			applyConfig();
		} else if (e.key === "Escape") {
			state.settingsOpen ? closeConfig() : openConfig();
		}
	});

	openConfig();
	loadAllSheets();
});