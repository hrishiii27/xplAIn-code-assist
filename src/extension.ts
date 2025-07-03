import * as vscode from 'vscode';
// @ts-ignore
// @ts-expect-error VS Code API typing issue: we use CodeAction.command for async fixes
import fetch from 'node-fetch';

const GEMINI_API_KEY_SECRET = 'geminiApiKey';
let extensionContext: vscode.ExtensionContext;
const outputChannel = vscode.window.createOutputChannel('xplAIn Gemini');

export function activate(context: vscode.ExtensionContext) {
	extensionContext = context;
	// Set Gemini API Key command
	const setApiKeyDisposable = vscode.commands.registerCommand('xplAIn-code-assist.setGeminiApiKey', async () => {
		const apiKey = await vscode.window.showInputBox({
			prompt: 'Enter your Gemini API Key',
			ignoreFocusOut: true,
			password: true
		});
		if (apiKey) {
			await context.secrets.store(GEMINI_API_KEY_SECRET, apiKey);
			vscode.window.showInformationMessage('Gemini API Key saved successfully!');
		} else {
			vscode.window.showWarningMessage('Gemini API Key not set.');
		}
	});
	context.subscriptions.push(setApiKeyDisposable);

	// Analyze Code Block command
	const analyzeDisposable = vscode.commands.registerCommand('xplAIn-code-assist.analyzeCodeBlock', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found.');
			return;
		}
		const selection = editor.selection;
		const selectedText = editor.document.getText(selection);
		if (!selectedText || selectedText.trim() === '') {
			vscode.window.showErrorMessage('Please select a code block to analyze.');
			return;
		}

		outputChannel.appendLine('[INFO] Analyzing selected code block...');
		const geminiResponse = await getGeminiAnalysis(selectedText);
		outputChannel.appendLine('[INFO] Analysis complete.');

		const panel = vscode.window.createWebviewPanel(
			'xplainCodeAnalysis',
			'AI Code Block Analysis',
			vscode.ViewColumn.Beside,
			{}
		);
		panel.webview.html = renderAnalysisHtml(selectedText, geminiResponse);
	});
	context.subscriptions.push(analyzeDisposable);

	// Suggest Alternative Implementations command
	const suggestAltDisposable = vscode.commands.registerCommand('xplAIn-code-assist.suggestAlternatives', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found.');
			return;
		}
		const selection = editor.selection;
		const selectedText = editor.document.getText(selection);
		if (!selectedText || selectedText.trim() === '') {
			vscode.window.showErrorMessage('Please select a code block to get alternatives.');
			return;
		}

		outputChannel.appendLine('[INFO] Requesting alternative implementations...');
		const alternatives = await getGeminiAlternatives(selectedText);
		outputChannel.appendLine('[INFO] Alternatives received.');

		const panel = vscode.window.createWebviewPanel(
			'xplainAltImplementations',
			'AI Alternative Implementations',
			vscode.ViewColumn.Beside,
			{}
		);
		panel.webview.html = renderAlternativesHtml(selectedText, alternatives);
	});
	context.subscriptions.push(suggestAltDisposable);

	// Show Code Diff with Alternative command
	const showDiffDisposable = vscode.commands.registerCommand('xplAIn-code-assist.showCodeDiff', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found.');
			return;
		}
		const selection = editor.selection;
		const selectedText = editor.document.getText(selection);
		if (!selectedText || selectedText.trim() === '') {
			vscode.window.showErrorMessage('Please select a code block to diff.');
			return;
		}

		outputChannel.appendLine('[INFO] Requesting single alternative implementation for diff...');
		const altCode = await getGeminiSingleAlternative(selectedText);
		outputChannel.appendLine('[INFO] Alternative code received.');

		const originalUri = vscode.Uri.parse('untitled:Original Code');
		const altUri = vscode.Uri.parse('untitled:AI Alternative');

		// Insert content into the untitled documents
		const editOriginal = new vscode.WorkspaceEdit();
		editOriginal.insert(originalUri, new vscode.Position(0, 0), selectedText);
		await vscode.workspace.applyEdit(editOriginal);

		const editAlt = new vscode.WorkspaceEdit();
		editAlt.insert(altUri, new vscode.Position(0, 0), altCode);
		await vscode.workspace.applyEdit(editAlt);

		// Set language for syntax highlighting
		await vscode.workspace.openTextDocument(originalUri).then(doc =>
			vscode.languages.setTextDocumentLanguage(doc, editor.document.languageId)
		);
		await vscode.workspace.openTextDocument(altUri).then(doc =>
			vscode.languages.setTextDocumentLanguage(doc, editor.document.languageId)
		);

		// Show the diff view only
		await vscode.commands.executeCommand(
			'vscode.diff',
			originalUri,
			altUri,
			'Original vs. AI Alternative'
		);
	});
	context.subscriptions.push(showDiffDisposable);

	// Analyze Selected Code for Issues command
	const diagnosticsCollection = vscode.languages.createDiagnosticCollection('xplain-ai-diagnostics');
	context.subscriptions.push(diagnosticsCollection);

	const analyzeIssuesDisposable = vscode.commands.registerCommand('xplAIn-code-assist.analyzeSelectedForIssues', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found.');
			return;
		}
		const selection = editor.selection;
		const selectedText = editor.document.getText(selection);
		if (!selectedText || selectedText.trim() === '') {
			vscode.window.showErrorMessage('Please select code to analyze for issues.');
			return;
		}

		outputChannel.appendLine('[INFO] Requesting diagnostics for selected code...');
		const diagnostics = await getGeminiDiagnostics(selectedText);
		outputChannel.appendLine('[INFO] Diagnostics received.');

		const docUri = editor.document.uri;
		const offset = editor.document.offsetAt(selection.start);

		const vscodeDiagnostics: vscode.Diagnostic[] = [];
		let panelHtml = `<style>body{font-family:'Segoe UI',Arial,sans-serif;color:#ddd;background:#222;}h2{color:#fff;}ul{margin:0.5em 0 0 1.5em;}li{margin-bottom:0.5em;}b{color:#ffd700;}i{color:#b5cea8;}</style><body><h2>AI Diagnostics</h2><ul>`;
		for (const diag of diagnostics) {
			const startLine = typeof diag.line === 'number' ? diag.line : 0;
			const startCol = typeof diag.column === 'number' ? diag.column : 0;
			const range = new vscode.Range(
				selection.start.line + startLine,
				startCol,
				selection.start.line + (diag.endLine ?? startLine),
				diag.endColumn ?? startCol + 1
			);
			const severity = diag.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
			const diagnostic = new vscode.Diagnostic(range, diag.message, severity);
			if (diag.suggestedFix) {
				(diagnostic as any).suggestedFix = diag.suggestedFix;
			}
			vscodeDiagnostics.push(diagnostic);
			panelHtml += `<li><b>${diag.severity?.toUpperCase() || 'ISSUE'}:</b> ${escapeHtml(diag.message)}<br/><i>Line: ${startLine + 1}, Column: ${startCol + 1}</i>${diag.suggestedFix ? `<br/><b>Suggested Fix:</b> ${escapeHtml(diag.suggestedFix)}` : ''}</li>`;
		}
		panelHtml += '</ul></body>';
		diagnosticsCollection.set(docUri, vscodeDiagnostics);

		const panel = vscode.window.createWebviewPanel(
			'xplainDiagnostics',
			'AI Diagnostics',
			vscode.ViewColumn.Beside,
			{}
		);
		panel.webview.html = panelHtml;
	});
	context.subscriptions.push(analyzeIssuesDisposable);

	// Register CodeActionProvider for Quick Fixes (for Python only, adjust as needed)
	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider(
			'python',
			new XplainAICodeActionProvider(),
			{
				providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
			}
		)
	);

	// Register a command to log applied quick fixes
	context.subscriptions.push(vscode.commands.registerCommand('xplAIn-code-assist.logQuickFix', (uri: string, range: vscode.Range, fix: string) => {
		outputChannel.appendLine(`[QUICK FIX APPLIED] File: ${uri}, Range: ${JSON.stringify(range)}, Fix: ${fix}`);
	}));

	// Register the command to apply AI-powered quick fixes
	context.subscriptions.push(
		vscode.commands.registerCommand('xplAIn-code-assist.applyAIFix', async (uri: vscode.Uri, range: vscode.Range, suggestedFix: string) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.uri.toString() !== uri.toString()) {
				vscode.window.showErrorMessage('Please open the file to apply the AI fix.');
				return;
			}
			const originalCode = editor.document.getText(range);
			outputChannel.appendLine(`[AI QUICK FIX] Original code: ${originalCode}`);
			outputChannel.appendLine(`[AI QUICK FIX] Suggested fix instruction: ${suggestedFix}`);

			// Call Gemini to get the modified code
			const modifiedCode = await getGeminiAppliedFix(originalCode, suggestedFix);
			if (!modifiedCode) {
				vscode.window.showErrorMessage('AI did not return a valid fix.');
				return;
			}
			await editor.edit(editBuilder => {
				editBuilder.replace(range, modifiedCode);
			});
			outputChannel.appendLine(`[AI QUICK FIX] Applied fix: ${modifiedCode}`);
		})
	);
}

export function deactivate() {}

async function getGeminiAnalysis(code: string): Promise<any> {
	const apiKey = await getGeminiApiKey();
	if (!apiKey) {
		vscode.window.showErrorMessage('Gemini API Key not set. Please run "AI: Set Gemini API Key".');
		outputChannel.appendLine('[ERROR] Gemini API Key not set.');
		return {
			explanation: 'No API key set.',
			purpose: '',
			performance: '',
			useCases: ''
		};
	}

	const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
	const prompt = `Analyze the following code block and provide:\n- Detailed code explanation in plain English\n- Purpose and functionality breakdown\n- Performance implications\n- Common use cases\n\nRespond in JSON with keys: explanation, purpose, performance, useCases.\n\nCode block:\n${code}`;

	outputChannel.appendLine('[REQUEST] POST ' + endpoint);
	outputChannel.appendLine('[REQUEST] Prompt: ' + prompt.substring(0, 500) + (prompt.length > 500 ? '... [truncated]' : ''));

	try {
		const response = await fetch(endpoint + `?key=${apiKey}` , {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }]
			})
		});
		outputChannel.appendLine(`[RESPONSE] Status: ${response.status} ${response.statusText}`);
		const data: any = await response.json();
		outputChannel.appendLine('[RESPONSE] Body: ' + JSON.stringify(data, null, 2));
		let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
		let analysis;
		if (typeof text === 'string') {
			try {
				let jsonText = text.trim();
				if (jsonText.startsWith('```json')) {
					jsonText = jsonText.replace(/^```json/, '').replace(/```$/, '').trim();
				} else if (jsonText.startsWith('```')) {
					jsonText = jsonText.replace(/^```/, '').replace(/```$/, '').trim();
				}
				analysis = JSON.parse(jsonText);
			} catch (e) {
				outputChannel.appendLine('[WARN] Could not parse JSON from Gemini analysis response. Returning raw text.');
				analysis = { explanation: text, purpose: '', performance: '', useCases: '' };
			}
		} else if (typeof text === 'object' && text !== null) {
			analysis = text;
		} else {
			outputChannel.appendLine('[ERROR] Gemini response text is not a string or object. Value: ' + JSON.stringify(text));
			analysis = { explanation: 'Gemini response was not a string or object. See Output panel for details.', purpose: '', performance: '', useCases: '' };
		}
		return analysis;
	} catch (err: any) {
		outputChannel.appendLine('[ERROR] Gemini API call failed: ' + err.message);
		vscode.window.showErrorMessage('Gemini API call failed: ' + err.message);
		return {
			explanation: 'Gemini API call failed: ' + err.message,
			purpose: '',
			performance: '',
			useCases: ''
		};
	}
}

async function getGeminiApiKey(): Promise<string | undefined> {
	if (!extensionContext) return undefined;
	return extensionContext.secrets.get(GEMINI_API_KEY_SECRET);
}

function markdownToHtml(text: string): string {
	if (!text) return '';
	// Replace **bold** with <b>bold</b>
	text = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
	// Replace `code` with <b><i>code</i></b>
	text = text.replace(/`([^`]+)`/g, '<b><i>$1</i></b>');
	return text;
}

function toHtmlListOrParagraph(val: any): string {
	if (Array.isArray(val)) {
		return '<ul>' + val.map((item: any) => `<li>${markdownToHtml(escapeHtml(String(item)))}</li>`).join('') + '</ul>';
	}
	if (typeof val === 'string') {
		// Convert Markdown-style bullets to HTML list
		const lines = val.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
		const bulletLines = lines.filter(line => line.match(/^([*-])\s+/));
		if (bulletLines.length > 0) {
			return '<ul>' + bulletLines.map(line => {
				const cleaned = line.replace(/^([*-])\s+/, '');
				return `<li>${markdownToHtml(escapeHtml(cleaned))}</li>`;
			}).join('') + '</ul>';
		}
		return `<p>${markdownToHtml(escapeHtml(val))}</p>`;
	}
	if (val !== undefined && val !== null) {
		return `<p>${markdownToHtml(escapeHtml(String(val)))}</p>`;
	}
	return '';
}

function renderAnalysisHtml(code: string, analysis: any): string {
	return `
		<style>
			body { font-family: 'Segoe UI', Arial, sans-serif; color: #ddd; background: #222; }
			h2 { margin-top: 1.5em; color: #fff; }
			pre { background: #181818; color: #b5cea8; padding: 1em; border-radius: 6px; overflow-x: auto; }
			ul { margin: 0.5em 0 0 1.5em; }
			li { margin-bottom: 0.5em; }
			p { margin: 0.5em 0; }
			b { color: #ffd700; }
			i { color: #b5cea8; }
		</style>
		<body>
		<h2>Selected Code</h2>
		<pre><code>${escapeHtml(code)}</code></pre>
		<h2>Explanation</h2>
		${toHtmlListOrParagraph(analysis.explanation)}
		<h2>Purpose & Functionality</h2>
		${toHtmlListOrParagraph(analysis.purpose)}
		<h2>Performance Implications</h2>
		${toHtmlListOrParagraph(analysis.performance)}
		<h2>Common Use Cases</h2>
		${toHtmlListOrParagraph(analysis.useCases)}
		</body>
	`;
}

function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (ch) => {
		const map: any = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
		return map[ch];
	});
}

async function getGeminiAlternatives(code: string): Promise<any> {
	const apiKey = await getGeminiApiKey();
	if (!apiKey) {
		vscode.window.showErrorMessage('Gemini API Key not set. Please run "AI: Set Gemini API Key".');
		outputChannel.appendLine('[ERROR] Gemini API Key not set.');
		return [];
	}

	const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
	const prompt = `Given the following code block, suggest 2 alternative implementations. For each alternative, provide:\n- Complete code snippet\n- Pros and cons\n- Performance differences\n- Best use case scenarios\n\nRespond in JSON as an array of objects with keys: code, pros, cons, performance, useCases.\n\nCode block:\n${code}`;

	outputChannel.appendLine('[REQUEST] POST ' + endpoint + '?key=REDACTED');
	outputChannel.appendLine('[REQUEST] Prompt: ' + prompt.substring(0, 500) + (prompt.length > 500 ? '... [truncated]' : ''));

	try {
		const response = await fetch(endpoint + `?key=${apiKey}` , {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }]
			})
		});
		outputChannel.appendLine(`[RESPONSE] Status: ${response.status} ${response.statusText}`);
		const data: any = await response.json();
		outputChannel.appendLine('[RESPONSE] Body: ' + JSON.stringify(data, null, 2));
		let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
		let alternatives;
		if (typeof text === 'string') {
			try {
				let jsonText = text.trim();
				if (jsonText.startsWith('```json')) {
					jsonText = jsonText.replace(/^```json/, '').replace(/```$/, '').trim();
				} else if (jsonText.startsWith('```')) {
					jsonText = jsonText.replace(/^```/, '').replace(/```$/, '').trim();
				}
				alternatives = JSON.parse(jsonText);
			} catch (e) {
				outputChannel.appendLine('[WARN] Could not parse JSON from Gemini alternatives response. Returning raw text.');
				alternatives = [{ code: text, pros: '', cons: '', performance: '', useCases: '' }];
			}
		} else if (typeof text === 'object' && text !== null) {
			alternatives = text;
		} else {
			outputChannel.appendLine('[ERROR] Gemini response text is not a string or object. Value: ' + JSON.stringify(text));
			alternatives = [{ code: 'Gemini response was not a string or object. See Output panel for details.', pros: '', cons: '', performance: '', useCases: '' }];
		}
		return alternatives;
	} catch (err: any) {
		outputChannel.appendLine('[ERROR] Gemini API call failed: ' + err.message);
		vscode.window.showErrorMessage('Gemini API call failed: ' + err.message);
		return [{ code: '', pros: '', cons: '', performance: '', useCases: '' }];
	}
}

function renderAlternativesHtml(originalCode: string, alternatives: any[]): string {
	let html = `
		<style>
			body { font-family: 'Segoe UI', Arial, sans-serif; color: #ddd; background: #222; }
			h2, h3 { color: #fff; }
			pre { background: #181818; color: #b5cea8; padding: 1em; border-radius: 6px; overflow-x: auto; }
			ul { margin: 0.5em 0 0 1.5em; }
			li { margin-bottom: 0.5em; }
			p { margin: 0.5em 0; }
			b { color: #ffd700; }
			i { color: #b5cea8; }
			.alt-block { border: 1px solid #444; border-radius: 8px; margin: 1.5em 0; padding: 1em; background: #232323; }
		</style>
		<body>
		<h2>Original Code</h2>
		<pre><code>${escapeHtml(originalCode)}</code></pre>
		<h2>Alternative Implementations</h2>
	`;
	if (!Array.isArray(alternatives) || alternatives.length === 0) {
		html += '<p>No alternatives found or response was malformed.</p>';
	} else {
		alternatives.slice(0, 2).forEach((alt, idx) => {
			html += `<div class="alt-block">
				<h3>Alternative ${idx + 1}</h3>
				<pre><code>${escapeHtml(alt.code || '')}</code></pre>
				<b>Pros:</b> ${toHtmlListOrParagraph(alt.pros)}
				<b>Cons:</b> ${toHtmlListOrParagraph(alt.cons)}
				<b>Performance:</b> ${toHtmlListOrParagraph(alt.performance)}
				<b>Best Use Cases:</b> ${toHtmlListOrParagraph(alt.useCases)}
			</div>`;
		});
	}
	html += '</body>';
	return html;
}

async function getGeminiSingleAlternative(code: string): Promise<string> {
	const apiKey = await getGeminiApiKey();
	if (!apiKey) {
		vscode.window.showErrorMessage('Gemini API Key not set. Please run "AI: Set Gemini API Key".');
		outputChannel.appendLine('[ERROR] Gemini API Key not set.');
		return '';
	}

	const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
	const prompt = `Given the following code block, suggest one alternative implementation. Respond with only the code, no explanation or formatting.\n\nCode block:\n${code}`;

	outputChannel.appendLine('[REQUEST] POST ' + endpoint + '?key=REDACTED');
	outputChannel.appendLine('[REQUEST] Prompt: ' + prompt.substring(0, 500) + (prompt.length > 500 ? '... [truncated]' : ''));

	try {
		const response = await fetch(endpoint + `?key=${apiKey}` , {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }]
			})
		});
		outputChannel.appendLine(`[RESPONSE] Status: ${response.status} ${response.statusText}`);
		const data: any = await response.json();
		outputChannel.appendLine('[RESPONSE] Body: ' + JSON.stringify(data, null, 2));
		let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
		if (typeof text === 'string') {
			// Remove Markdown code block if present
			let codeText = text.trim();
			// Remove ```python\n or ```\n at the start, and ``` at the end
			codeText = codeText.replace(/^```[a-zA-Z]*\s*/, '').replace(/```$/, '').trim();
			return codeText;
		} else {
			outputChannel.appendLine('[ERROR] Gemini response text is not a string. Value: ' + JSON.stringify(text));
			return '';
		}
	} catch (err: any) {
		outputChannel.appendLine('[ERROR] Gemini API call failed: ' + err.message);
		vscode.window.showErrorMessage('Gemini API call failed: ' + err.message);
		return '';
	}
}

async function getGeminiDiagnostics(code: string): Promise<any[]> {
	const apiKey = await getGeminiApiKey();
	if (!apiKey) {
		vscode.window.showErrorMessage('Gemini API Key not set. Please run "AI: Set Gemini API Key".');
		outputChannel.appendLine('[ERROR] Gemini API Key not set.');
		return [];
	}

	const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
	const prompt = `Analyze the following code and return a JSON array of issues found. For each issue, include: line (0-based, relative to input), column (0-based), message, severity (error/warning), and suggestedFix (if any).\n\nCode:\n${code}`;

	outputChannel.appendLine('[REQUEST] POST ' + endpoint + '?key=REDACTED');
	outputChannel.appendLine('[REQUEST] Prompt: ' + prompt.substring(0, 500) + (prompt.length > 500 ? '... [truncated]' : ''));

	try {
		const response = await fetch(endpoint + `?key=${apiKey}` , {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }]
			})
		});
		outputChannel.appendLine(`[RESPONSE] Status: ${response.status} ${response.statusText}`);
		const data: any = await response.json();
		outputChannel.appendLine('[RESPONSE] Body: ' + JSON.stringify(data, null, 2));
		let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
		let diagnostics: any[] = [];
		if (typeof text === 'string') {
			try {
				let jsonText = text.trim();
				if (jsonText.startsWith('```json')) {
					jsonText = jsonText.replace(/^```json/, '').replace(/```$/, '').trim();
				} else if (jsonText.startsWith('```')) {
					jsonText = jsonText.replace(/^```/, '').replace(/```$/, '').trim();
				}
				diagnostics = JSON.parse(jsonText);
			} catch (e) {
				outputChannel.appendLine('[WARN] Could not parse JSON from Gemini diagnostics response. Returning empty.');
				diagnostics = [];
			}
		} else if (Array.isArray(text)) {
			diagnostics = text;
		} else {
			outputChannel.appendLine('[ERROR] Gemini diagnostics response text is not a string or array. Value: ' + JSON.stringify(text));
			diagnostics = [];
		}
		return diagnostics;
	} catch (err: any) {
		outputChannel.appendLine('[ERROR] Gemini API call failed: ' + err.message);
		vscode.window.showErrorMessage('Gemini API call failed: ' + err.message);
		return [];
	}
}

class XplainAICodeActionProvider implements vscode.CodeActionProvider<vscode.CodeAction> {
	provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection,
		context: vscode.CodeActionContext,
		token: vscode.CancellationToken
	): vscode.ProviderResult<vscode.CodeAction[]> {
		const actions: vscode.CodeAction[] = [];
		for (const diagnostic of context.diagnostics) {
			const match = diagnostic.message.match(/\n\[SUGGESTED_FIX\]: (.+)$/);
			let suggestedFix = (diagnostic as any).suggestedFix;
			if (!suggestedFix && match) {
				suggestedFix = match[1];
			}
			if (suggestedFix) {
				const fix = new vscode.CodeAction('Apply AI Quick Fix', vscode.CodeActionKind.QuickFix);
				fix.command = {
					title: 'Apply AI Quick Fix',
					command: 'xplAIn-code-assist.applyAIFix',
					arguments: [document.uri, diagnostic.range, suggestedFix]
				};
				fix.diagnostics = [diagnostic];
				fix.isPreferred = true;
				actions.push(fix);
			}
		}
		return actions;
	}
}

// Helper to call Gemini to apply a fix instruction to code
async function getGeminiAppliedFix(code: string, instruction: string): Promise<string> {
	const apiKey = await getGeminiApiKey();
	if (!apiKey) {
		vscode.window.showErrorMessage('Gemini API Key not set. Please run "AI: Set Gemini API Key".');
		outputChannel.appendLine('[ERROR] Gemini API Key not set.');
		return '';
	}

	const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
	const prompt = `Given the following code and this instruction, return the modified code only (no explanation, no formatting, just the code):\n\nCode:\n${code}\n\nInstruction:\n${instruction}`;

	outputChannel.appendLine('[REQUEST] POST ' + endpoint + '?key=REDACTED');
	outputChannel.appendLine('[REQUEST] Prompt: ' + prompt.substring(0, 500) + (prompt.length > 500 ? '... [truncated]' : ''));

	try {
		const response = await fetch(endpoint + `?key=${apiKey}` , {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }]
			})
		});
		outputChannel.appendLine(`[RESPONSE] Status: ${response.status} ${response.statusText}`);
		const data: any = await response.json();
		outputChannel.appendLine('[RESPONSE] Body: ' + JSON.stringify(data, null, 2));
		let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
		if (typeof text === 'string') {
			// Remove Markdown code block if present
			let codeText = text.trim();
			codeText = codeText.replace(/^```[a-zA-Z]*\s*/, '').replace(/```$/, '').trim();
			return codeText;
		} else {
			outputChannel.appendLine('[ERROR] Gemini response text is not a string. Value: ' + JSON.stringify(text));
			return '';
		}
	} catch (err: any) {
		outputChannel.appendLine('[ERROR] Gemini API call failed: ' + err.message);
		vscode.window.showErrorMessage('Gemini API call failed: ' + err.message);
		return '';
	}
}

