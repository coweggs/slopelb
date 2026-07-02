const PRESETS = {
	ub: {
		id: "1eljby7eGGqhvvfpIpoeRvTBfg6DQ7_QzHEJl4Sz_sq8",
		sheetNames: ["Score", "Unofficial Score"],
		sheetLabels: ["Official", "Unofficial"],
		nameCols: [1, 1],
		scoreCols: [2, 2],
	},
	plus: {
		id: "1Ogd5Cql3j6lS5r0aE99MDuY7GkxRhg-5onqlmwdoB00",
		sheetNames: ["Score", "Unofficial Score"],
		sheetLabels: ["Official", "Unofficial"],
		nameCols: [1, 1],
		scoreCols: [2, 2],
	},
	highestscoresever: {
		id: "1UOy09nkR7ggUa4UfFYySOXE1ASu3d55ciZaCpVab7gw",
		sheetNames: ["Unblocked", "Plus"],
		sheetLabels: ["Unblocked", "Plus"],
		nameCols: [1, 1],
		scoreCols: [0, 0],
	},
};

const DEFAULTS = {
	boardTitle: "Score Leaderboard",
	spreadsheetChoice: "ub",
	spreadsheetId: PRESETS.ub.id,
	sheetNames: [...PRESETS.ub.sheetNames],
	sheetLabels: [...PRESETS.ub.sheetLabels],
	nameCols: [...PRESETS.ub.nameCols],
	scoreCols: [...PRESETS.ub.scoreCols],
	startRank: 1,
	endRank: 10,
};

const COLUMN_WIDTH_PX = 650;
const BENCHMARK_TOTAL_HEIGHT_PX = 950;
const BENCHMARK_ROW_COUNT = 10;

let state = { ...DEFAULTS, settingsOpen: false };
let rowHeightPx = (BENCHMARK_TOTAL_HEIGHT_PX - 250) / BENCHMARK_ROW_COUNT;
let calibrated = false;
let applyTimer = null;
let suppressAutoApply = false; // true while we're programmatically filling fields from a preset

function calibrateRowHeight(columns) {
	if (calibrated) return;
	const rowCount = Math.abs(state.endRank - state.startRank) + 1;
	if (rowCount !== BENCHMARK_ROW_COUNT) return;

	const actualHeight = el("sheets").getBoundingClientRect().height;
	const error = BENCHMARK_TOTAL_HEIGHT_PX - actualHeight;
	rowHeightPx += error / rowCount;
	calibrated = true;
	console.log("CALIBRATED rowHeightPx:", rowHeightPx);
	renderRows(columns);
}

const el = (id) => document.getElementById(id);

function parseList(value, fallback) {
	const values = (value || "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return values.length ? values : [...fallback];
}

function parseNumList(value, fallback) {
	const values = (value || "")
		.split(",")
		.map((s) => Number.parseInt(s.trim(), 10))
		.filter((n) => !Number.isNaN(n));
	return values.length ? values : [...fallback];
}

function parseNum(value, fallback) {
	const n = Number.parseInt(value, 10);
	return Number.isNaN(n) ? fallback : n;
}

function parseEntry(row, nameCol, scoreCol) {
	return {
		name: String(row[nameCol] ?? "").trim(),
		score: String(row[scoreCol] ?? "").trim(),
	};
}

async function fetchEntries(spreadsheetId, sheetName, nameCol, scoreCol) {
	const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tqx=out:json`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);

	const text = await res.text();
	const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
	const rows = (json.table.rows || [])
		.map((r) => (r.c || []).map((c) => c?.f ?? c?.v ?? ""))
		.filter((r) => r.some((v) => String(v).trim() !== ""));

	if (rows.length === 0) throw new Error("No rows found.");

	return rows.map((row) => parseEntry(row, nameCol, scoreCol));
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

			const entry = col.entries?.[rank];
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

			tr.appendChild(td);
		});

		container.appendChild(tr);
	}
}

async function loadAllSheets() {
	renderHeader();

	const columns = await Promise.all(
		state.sheetNames.map((name, i) =>
			fetchEntries(state.spreadsheetId, name, state.nameCols[i] ?? 1, state.scoreCols[i] ?? 2)
				.then((entries) => ({ entries }))
				.catch((err) => ({ error: `Could not load: ${err.message}` })),
		),
	);

	renderRows(columns);
	calibrateRowHeight(columns);
}

// --- config modal ---

function applyUrlParams() {
	const params = new URLSearchParams(location.search);
	if (!params.toString()) return;

	if (params.has("title")) state.boardTitle = params.get("title");
	if (params.has("start")) state.startRank = parseNum(params.get("start"), state.startRank);
	if (params.has("end")) state.endRank = parseNum(params.get("end"), state.endRank);
	if (params.has("id")) state.spreadsheetId = params.get("id");
	if (params.has("names")) state.sheetNames = parseList(params.get("names"), state.sheetNames);
	if (params.has("labels")) state.sheetLabels = parseList(params.get("labels"), state.sheetLabels);
	if (params.has("nameCols")) state.nameCols = parseNumList(params.get("nameCols"), state.nameCols);
	if (params.has("scoreCols")) state.scoreCols = parseNumList(params.get("scoreCols"), state.scoreCols);

	// template=ub/plus/highestscoresever loads full preset, overridable by other params above/below it in the string
	if (params.has("template") && PRESETS[params.get("template")]) {
		const p = PRESETS[params.get("template")];
		state.spreadsheetId = params.get("id") || p.id;
		state.sheetNames = params.has("names") ? state.sheetNames : [...p.sheetNames];
		state.sheetLabels = params.has("labels") ? state.sheetLabels : [...p.sheetLabels];
		state.nameCols = params.has("nameCols") ? state.nameCols : [...p.nameCols];
		state.scoreCols = params.has("scoreCols") ? state.scoreCols : [...p.scoreCols];
	}

	// align lengths same as applyConfig
	const n = state.sheetNames.length;
	while (state.sheetLabels.length < n) state.sheetLabels.push(state.sheetNames[state.sheetLabels.length]);
	while (state.nameCols.length < n) state.nameCols.push(state.nameCols[state.nameCols.length - 1] ?? 1);
	while (state.scoreCols.length < n) state.scoreCols.push(state.scoreCols[state.scoreCols.length - 1] ?? 2);
	state.sheetLabels.length = n;
	state.nameCols.length = n;
	state.scoreCols.length = n;
}

function populateTemplateSelect() {
	const sel = el("spreadsheet-choice");
	sel.innerHTML = "";
	for (const key of Object.keys(PRESETS)) {
		const opt = document.createElement("option");
		opt.value = key;
		opt.textContent = key;
		sel.appendChild(opt);
	}
	const custom = document.createElement("option");
	custom.value = "custom";
	custom.textContent = "Custom";
	sel.appendChild(custom);
}

function matchesPreset(key) {
	const p = PRESETS[key];
	if (!p) return false;
	return (
		el("spreadsheet-id").value.trim() === p.id &&
		el("sheet-names").value.trim() === p.sheetNames.join(", ") &&
		el("sheet-labels").value.trim() === p.sheetLabels.join(", ") &&
		el("name-cols").value.trim() === p.nameCols.join(", ") &&
		el("score-cols").value.trim() === p.scoreCols.join(", ")
	);
}

function syncTemplateBadge() {
	const sel = el("spreadsheet-choice");
	const match = Object.keys(PRESETS).find(matchesPreset);
	sel.value = match || "custom";
}

function syncConfigForm() {
	el("board-title-input").value = state.boardTitle;
	el("start-rank").value = state.startRank;
	el("end-rank").value = state.endRank;
	el("spreadsheet-choice").value = state.spreadsheetChoice;
	el("spreadsheet-id").value = state.spreadsheetId;
	el("sheet-names").value = state.sheetNames.join(", ");
	el("sheet-labels").value = state.sheetLabels.join(", ");
	el("name-cols").value = state.nameCols.join(", ");
	el("score-cols").value = state.scoreCols.join(", ");
	syncTemplateBadge();
}

function loadPreset(key) {
	const preset = PRESETS[key];
	if (!preset) return; // "custom" selected manually -> leave fields as-is
	suppressAutoApply = true;
	el("spreadsheet-id").value = preset.id;
	el("sheet-names").value = preset.sheetNames.join(", ");
	el("sheet-labels").value = preset.sheetLabels.join(", ");
	el("name-cols").value = preset.nameCols.join(", ");
	el("score-cols").value = preset.scoreCols.join(", ");
	suppressAutoApply = false;
	applyConfig();
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

	state.spreadsheetId = el("spreadsheet-id").value.trim() || DEFAULTS.spreadsheetId;
	state.sheetNames = parseList(el("sheet-names").value, DEFAULTS.sheetNames);
	state.sheetLabels = parseList(el("sheet-labels").value, DEFAULTS.sheetLabels);
	state.nameCols = parseNumList(el("name-cols").value, DEFAULTS.nameCols);
	state.scoreCols = parseNumList(el("score-cols").value, DEFAULTS.scoreCols);

	// keep labels/cols aligned 1:1 with names
	const n = state.sheetNames.length;
	while (state.sheetLabels.length < n) state.sheetLabels.push(state.sheetNames[state.sheetLabels.length]);
	while (state.nameCols.length < n) state.nameCols.push(state.nameCols[state.nameCols.length - 1] ?? 1);
	while (state.scoreCols.length < n) state.scoreCols.push(state.scoreCols[state.scoreCols.length - 1] ?? 2);
	state.sheetLabels.length = n;
	state.nameCols.length = n;
	state.scoreCols.length = n;

	syncTemplateBadge();
	state.spreadsheetChoice = el("spreadsheet-choice").value;

	loadAllSheets();
}

function queueApply() {
	if (suppressAutoApply) return;
	syncTemplateBadge(); // flip to "Custom" the instant a field drifts from preset
	clearTimeout(applyTimer);
	applyTimer = setTimeout(applyConfig, 400);
}

function resetConfig() {
	state = { ...DEFAULTS, settingsOpen: state.settingsOpen };
	syncConfigForm();
	loadAllSheets();
}

function buildStateUrl() {
	const params = new URLSearchParams();
	params.set("title", state.boardTitle);
	params.set("start", state.startRank);
	params.set("end", state.endRank);
	params.set("id", state.spreadsheetId);
	params.set("names", state.sheetNames.join(","));
	params.set("labels", state.sheetLabels.join(","));
	params.set("nameCols", state.nameCols.join(","));
	params.set("scoreCols", state.scoreCols.join(","));
	params.set("embed", "1");
	return `${location.origin}${location.pathname}?${params.toString()}`;
}

function generateEmbedLink() {
	el("config-embed").textContent = "Loading...";
	el("config-embed").disabled = true;

	await loadAllSheets();

	const targetUrl = buildStateUrl();
	const rect = el("sheets").getBoundingClientRect();
	const w = Math.ceil(rect.width);
	const h = Math.ceil(rect.height);
	const cacheBust = Date.now();

	const shotUrl = `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=${w}&viewport.height=${h}&waitUntil=networkidle0&waitFor=2000&force=true&_=${cacheBust}`;

	navigator.clipboard.writeText(shotUrl).then(() => {
		el("config-embed").textContent = "Copied!";
		setTimeout(() => (el("config-embed").textContent = "Generate Embed Link"), 1500);
	});
}

document.addEventListener("DOMContentLoaded", () => {
	populateTemplateSelect();
	applyUrlParams();

	const textFields = [
		"board-title-input",
		"start-rank",
		"end-rank",
		"spreadsheet-id",
		"sheet-names",
		"sheet-labels",
		"name-cols",
		"score-cols",
	];
	textFields.forEach((id) => el(id).addEventListener("input", queueApply));

	el("spreadsheet-choice").addEventListener("change", (e) => {
		if (e.target.value === "custom") return; // just a badge state, no preset to load
		loadPreset(e.target.value);
	});

	el("config-close").addEventListener("click", closeConfig);
	el("config-reset").addEventListener("click", resetConfig);
    el("config-embed").addEventListener("click", generateEmbedLink);
	el("config-backdrop").addEventListener("click", (e) => e.target === el("config-backdrop") && closeConfig());

	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") state.settingsOpen ? closeConfig() : openConfig();
	});

	loadAllSheets();
});
