# xplAIn: AI Code Refactor & Analysis

Enhance your code understanding and refactoring with Google Gemini-powered AI. Analyze code, get alternative implementations, visualize diffs, and apply smart code fixes—all from within VS Code.

---

## 🚀 Features

- **AI Code Block Analysis:**
  - Get plain-English explanations, purpose, performance, and use cases for any code block.
- **Alternative Implementations:**
  - Instantly see two alternative ways to implement your selected code, with pros/cons and use cases.
- **Code Diff Visualization:**
  - View a side-by-side diff between your code and an AI-generated alternative.
- **AI Diagnostics & Quick Fixes:**
  - Analyze code for issues and apply AI-suggested fixes directly via the lightbulb Quick Fix menu.
- **Secure Gemini API Key Management:**
  - Store your Gemini API key securely using VS Code's secret storage.

---

## 🛠️ Usage

1. **Set Gemini API Key**
   - Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
   - Run `AI: Set Gemini API Key` and paste your Gemini API key.

2. **Analyze Code Block**
   - Select code → Command Palette → `AI: Analyze Selected Code Block`
   - View detailed AI analysis in a webview.

3. **Suggest Alternative Implementations**
   - Select code → Command Palette → `AI: Suggest Alternative Implementations`
   - See two alternatives with pros/cons and use cases.

4. **Show Code Diff with Alternative**
   - Select code → Command Palette → `AI: Show Code Diff with Alternative`
   - Compare your code with an AI-generated alternative side-by-side.

5. **Analyze Selected Code for Issues**
   - Select code → Command Palette → `AI: Analyze Selected Code for Issues`
   - See squiggle diagnostics and a panel with explanations and suggested fixes.
   - Use the lightbulb Quick Fix to apply AI-powered fixes.

---

## ⚙️ Requirements

- **Gemini API Key:**
  - Get your key from [Google AI Studio](https://aistudio.google.com/app/apikey).
  - Set it via the `AI: Set Gemini API Key` command.

---

## ⚡ Extension Settings

- No custom settings (API key is managed securely via VS Code's secret storage).

---

## 🐞 Known Issues

- Diagnostics are on-demand (not real-time) to avoid API quota exhaustion.
- Gemini API may occasionally return unexpected formats; errors are handled gracefully.

---

## 📝 Release Notes

### 0.0.1
- Initial release: AI code analysis, alternatives, diff, diagnostics, and quick fixes.

---

## 📚 Resources

- [Google Gemini API](https://aistudio.google.com/app/apikey)
- [VS Code Extension Docs](https://code.visualstudio.com/api)

---

**Enjoy smarter coding with xplAIn!**
