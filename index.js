const UB_SPREADSHEET_ID = "1eljby7eGGqhvvfpIpoeRvTBfg6DQ7_QzHEJl4Sz_sq8";
const PLUS_SPREADSHEET_ID = "1Ogd5Cql3j6lS5r0aE99MDuY7GkxRhg-5onqlmwdoB00";
const DEFAULT_BOARD_TITLE = "Score Leaderboard";
const DEFAULT_SHEET_NAMES = ["Score", "Unofficial Score"];
const DEFAULT_SHEET_LABELS = ["Official", "Unofficial"];
const DEFAULT_SPREADSHEET_CHOICE = "ub";
const COLUMN_WIDTH_PX = 650;
const DEFAULT_START_RANK = 0;
const DEFAULT_END_RANK = 10;

const appState = {
	boardTitle: DEFAULT_BOARD_TITLE,
	startRank: DEFAULT_START_RANK,
	endRank: DEFAULT_END_RANK,
	spreadsheetChoice: DEFAULT_SPREADSHEET_CHOICE,
	sheetNames: [...DEFAULT_SHEET_NAMES],
	sheetLabels: [...DEFAULT_SHEET_LABELS],
	settingsOpen: false,
};

function parsePromptList(value, fallbackValues) {
	if (!value) {
		return [...fallbackValues];
	}

	const values = value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);

	if (values.length === 0) {
		return [...fallbackValues];
	}

	while (values.length < fallbackValues.length) {
		values.push(fallbackValues[values.length]);
	}

	return values.slice(0, fallbackValues.length);
}

function parseCommaList(value, fallbackValues = []) {
	if (!value) {
		return [...fallbackValues];
	}

	const values = value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);

	if (values.length === 0) {
		return [...fallbackValues];
	}

	return values;
}

function getSpreadsheetId(spreadsheetChoice) {
	return spreadsheetChoice === "plus" ? PLUS_SPREADSHEET_ID : UB_SPREADSHEET_ID;
}

function parseNumberInput(value, fallbackValue) {
	const parsedValue = Number.parseInt(String(value).trim(), 10);
	return Number.isNaN(parsedValue) ? fallbackValue : parsedValue;
}

function gvizUrl(spreadsheetId, sheetName) {
	const encodedSheet = encodeURIComponent(sheetName);
	return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=${encodedSheet}&tqx=out:json`;
}

function parseGvizResponse(text) {
	const jsonStart = text.indexOf("{");
	const jsonEnd = text.lastIndexOf("}");

	if (jsonStart === -1 || jsonEnd === -1) {
		throw new Error("Invalid GViz response format");
	}

	const rawJson = text.slice(jsonStart, jsonEnd + 1);
	const data = JSON.parse(rawJson);

	const columns = data.table.cols.map((col, index) => col.label || `Column ${index + 1}`);
	const rows = data.table.rows.map((row) => {
		const cells = row.c || [];
		return columns.map((_, idx) => {
			const cell = cells[idx];
			if (!cell) {
				return "";
			}

			return cell.f ?? cell.v ?? "";
		});
	});

	return { columns, rows };
}

async function fetchSheet(spreadsheetId, sheetName) {
	const response = await fetch(gvizUrl(spreadsheetId, sheetName));

	if (!response.ok) {
		throw new Error(`HTTP ${response.status} while loading ${sheetName}`);
	}

	const text = await response.text();
	return parseGvizResponse(text);
}

function toLeaderboardEntries(rows) {
	return rows
		.map((row) => row.filter((value) => String(value).trim() !== ""))
		.filter((row) => row.length > 0)
		.map((row) => {
			if (row.length >= 2) {
				return {
					name: String(row[0]).trim(),
					score: String(row[1]).trim(),
				};
			}

			const single = String(row[0]);
			const split = single.match(/^(.*?)[\s:,-]+(\d+(?:\.\d+)?)$/);
			if (split) {
				return {
					name: split[1].trim(),
					score: split[2].trim(),
				};
			}

			return {
				name: single.trim(),
				score: "",
			};
		});
}

function formatEntry(entry, rank) {
	if (!entry) {
		return ``;
	}

	return entry.score ? `${rank}. ${entry.name}: ${entry.score}` : `${rank}. ${entry.name}`;
}

function renderTableRows(rowsContainer, columnData, sheetNames) {
	rowsContainer.textContent = "";
	const startRank = Math.min(appState.startRank, appState.endRank);
	const endRank = Math.max(appState.startRank, appState.endRank);

	for (let i = startRank; i <= endRank; i += 1) {
		const row = document.createElement("tr");

		for (let columnIndex = 0; columnIndex < sheetNames.length; columnIndex += 1) {
			const cell = document.createElement("td");
			cell.className = "panel-body";

			const currentColumn = columnData[columnIndex];
			if (currentColumn?.error) {
				cell.textContent = i === startRank ? currentColumn.error : "";
				if (i === startRank) {
					cell.classList.add("error");
				}
			} else {
				// render name (truncated) on left and score on right
				const entry = currentColumn?.entries?.[i];
				const wrapper = document.createElement("div");
				wrapper.className = "entry-row";

				const left = document.createElement("div");
				left.className = "entry-left";

				const right = document.createElement("div");
				right.className = "entry-score";

				if (!entry) {
					left.textContent = `${i}.`;
					right.textContent = "";
				} else {
					left.textContent = `${i}. ${entry.name}`;
					left.title = entry.name || "";
					right.textContent = entry.score || "";
				}

				wrapper.appendChild(left);
				wrapper.appendChild(right);
				cell.appendChild(wrapper);
			}

			row.appendChild(cell);
		}

		rowsContainer.appendChild(row);
	}
}

function syncPanelTitles(sheetNames, sheetLabels) {
	const titleNodes = Array.from(document.querySelectorAll(".panel-title"));
	titleNodes.forEach((titleNode, index) => {
		titleNode.textContent = sheetLabels[index] || sheetNames[index] || "";
	});
}

function getConfigElements() {
	return {
		backdrop: document.getElementById("config-backdrop"),
		title: document.getElementById("board-title-input"),
		startRank: document.getElementById("start-rank"),
		endRank: document.getElementById("end-rank"),
		choice: document.getElementById("spreadsheet-choice"),
		names: document.getElementById("sheet-names"),
		labels: document.getElementById("sheet-labels"),
		apply: document.getElementById("config-apply"),
		reset: document.getElementById("config-reset"),
	};
}

function syncConfigForm() {
	const { title, startRank, endRank, choice, names, labels } = getConfigElements();
	if (!title || !startRank || !endRank || !choice || !names || !labels) {
		return;
	}

	title.value = appState.boardTitle;
	startRank.value = String(appState.startRank);
	endRank.value = String(appState.endRank);
	choice.value = appState.spreadsheetChoice;
	names.value = appState.sheetNames.join(", ");
	labels.value = appState.sheetLabels.join(", ");
}

function openConfigModal() {
	const { backdrop, choice } = getConfigElements();
	if (!backdrop) {
		return;
	}

	syncConfigForm();
	backdrop.hidden = false;
	backdrop.classList.add("is-open");
	appState.settingsOpen = true;
	window.setTimeout(() => choice?.focus(), 0);
}

function closeConfigModal() {
	const { backdrop } = getConfigElements();
	if (!backdrop) {
		return;
	}

	backdrop.classList.remove("is-open");
	backdrop.hidden = true;
	appState.settingsOpen = false;
}

function applyConfigFromForm() {
	const { title, startRank, endRank, choice, names, labels } = getConfigElements();
	if (!title || !startRank || !endRank || !choice || !names || !labels) {
		return;
	}

	appState.boardTitle = title.value.trim() || DEFAULT_BOARD_TITLE;
	appState.startRank = parseNumberInput(startRank.value, DEFAULT_START_RANK);
	appState.endRank = parseNumberInput(endRank.value, DEFAULT_END_RANK);
	if (appState.endRank < appState.startRank) {
		const swapValue = appState.startRank;
		appState.startRank = appState.endRank;
		appState.endRank = swapValue;
	}
	appState.spreadsheetChoice = String(choice.value || DEFAULT_SPREADSHEET_CHOICE).trim().toLowerCase();
	appState.sheetNames = parseCommaList(names.value, DEFAULT_SHEET_NAMES);
	appState.sheetLabels = parseCommaList(labels.value, DEFAULT_SHEET_LABELS);
	while (appState.sheetLabels.length < appState.sheetNames.length) {
		appState.sheetLabels.push(appState.sheetNames[appState.sheetLabels.length]);
	}
	if (appState.sheetLabels.length > appState.sheetNames.length) {
		appState.sheetLabels = appState.sheetLabels.slice(0, appState.sheetNames.length);
	}
	closeConfigModal();
	loadAllSheets();
}

function syncBoardTitle() {
	const titleNode = document.getElementById("board-title");
	if (titleNode) {
		titleNode.textContent = appState.boardTitle;
		titleNode.colSpan = Math.max(1, appState.sheetLabels.length);
	}
}

function syncTableWidth() {
	const table = document.getElementById("sheets");
	if (!table) {
		return;
	}

	const columnCount = Math.max(1, appState.sheetLabels.length);
	table.style.width = `${columnCount * COLUMN_WIDTH_PX}px`;
}

function syncColumnHeaders(sheetLabels) {
	const headerRow = document.getElementById("panel-title-row");
	if (!headerRow) {
		return;
	}

	headerRow.textContent = "";

	for (const label of sheetLabels) {
		const header = document.createElement("th");
		header.className = "panel-title";
		header.textContent = label;
		headerRow.appendChild(header);
	}
}

async function loadAllSheets() {
	const target = document.getElementById("sheets");
	if (!target) {
		return;
	}

	syncBoardTitle();
	syncColumnHeaders(appState.sheetLabels);
	syncTableWidth();

	const rowsContainer = document.getElementById("leaderboard-rows");
	if (!rowsContainer) {
		return;
	}

	const columnData = [];

	for (const [index, sheetName] of appState.sheetNames.entries()) {
		try {
			const { columns, rows } = await fetchSheet(getSpreadsheetId(appState.spreadsheetChoice), sheetName);
			if (columns.length === 0 || rows.length === 0) {
				columnData[index] = { error: "No rows found." };
				continue;
			}

			columnData[index] = { entries: toLeaderboardEntries(rows) };
		} catch (error) {
			columnData[index] = { error: `Could not load: ${error.message}` };
		}
	}

	renderTableRows(rowsContainer, columnData, appState.sheetNames);
}

document.addEventListener("DOMContentLoaded", () => {
	const { apply, reset, close, backdrop } = {
		...getConfigElements(),
		close: document.getElementById("config-close"),
	};
	apply?.addEventListener("click", applyConfigFromForm);
	close?.addEventListener("click", closeConfigModal);
	reset?.addEventListener("click", () => {
		appState.boardTitle = DEFAULT_BOARD_TITLE;
		appState.startRank = DEFAULT_START_RANK;
		appState.endRank = DEFAULT_END_RANK;
		appState.spreadsheetChoice = DEFAULT_SPREADSHEET_CHOICE;
		appState.sheetNames = [...DEFAULT_SHEET_NAMES];
		appState.sheetLabels = [...DEFAULT_SHEET_LABELS];
		syncConfigForm();
	});
	backdrop?.addEventListener("click", (event) => {
		if (event.target === backdrop) {
			closeConfigModal();
		}
	});
	document.addEventListener("keydown", (event) => {
		if (event.key === "Enter" && appState.settingsOpen) {
			event.preventDefault();
			applyConfigFromForm();
			return;
		}

		if (event.key === "Escape") {
			if (appState.settingsOpen) {
				closeConfigModal();
				return;
			}

			openConfigModal();
		}
	});
	openConfigModal();
	loadAllSheets();
});
