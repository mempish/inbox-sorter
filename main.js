"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => InboxSorterPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  inboxFolder: "Inbox",
  defaultTags: "inbox",
  defaultTargetFolder: "Notes"
};
var InboxSorterPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "inbox-sorter-open-modal",
      name: "Open inbox sorter",
      checkCallback: (checking) => {
        if (!checking) {
          new InboxSorterModal(this.app, this).open();
        }
        return true;
      }
    });
    this.addSettingTab(new InboxSorterSettingTab(this.app, this));
  }
  getDefaultTags() {
    return this.normalizeTags(this.settings.defaultTags.split(","));
  }
  normalizeTags(rawTags) {
    return rawTags.map((tag) => tag.trim()).filter((tag) => tag.length > 0).map((tag) => this.normalizeTag(tag));
  }
  normalizeTag(tag) {
    return tag.startsWith("#") ? tag.slice(1) : tag;
  }
  extractTags(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((tag) => String(tag));
    }
    if (typeof value === "string") {
      return value.split(",").map((tag) => tag.trim());
    }
    return [];
  }
  mergeTags(existing, incoming) {
    const set = new Set(existing.map((tag) => this.normalizeTag(tag)));
    for (const tag of incoming) {
      set.add(this.normalizeTag(tag));
    }
    return Array.from(set.values());
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var InboxSorterSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Inbox Sorter Settings" });
    new import_obsidian.Setting(containerEl).setName("Inbox folder").setDesc("Folder containing notes to process").addText(
      (text) => text.setPlaceholder("Inbox").setValue(this.plugin.settings.inboxFolder).onChange(async (value) => {
        this.plugin.settings.inboxFolder = value.trim() || "Inbox";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Default target folder").setDesc("Default destination folder for filed notes").addText(
      (text) => text.setPlaceholder("Notes").setValue(this.plugin.settings.defaultTargetFolder).onChange(async (value) => {
        this.plugin.settings.defaultTargetFolder = value.trim() || "Notes";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Default tags").setDesc("Comma-separated tags suggested for new inbox items").addTextArea(
      (text) => text.setPlaceholder("inbox, to-process").setValue(this.plugin.settings.defaultTags).onChange(async (value) => {
        this.plugin.settings.defaultTags = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("p", {
      text: "Open the inbox sorter from the command palette.",
      cls: "inbox-sorter-hint"
    });
  }
};
var InboxSorterModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.selectedFile = null;
    this.tagsInput = "";
    this.propertiesInput = "";
    this.plugin = plugin;
    this.selectedFolder = plugin.settings.defaultTargetFolder;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("inbox-sorter-modal");
    contentEl.createEl("h2", { text: "Inbox Sorter" });
    const fileSetting = new import_obsidian.Setting(contentEl).setName("Inbox file").setDesc("Select a file to review").addExtraButton(
      (button) => button.setIcon("refresh-cw").setTooltip("Refresh file list").onClick(() => this.refreshFileList())
    );
    this.fileSelectEl = fileSetting.controlEl.createEl("select");
    this.fileSelectEl.addClass("inbox-sorter-select");
    this.fileSelectEl.addEventListener("change", () => {
      const value = this.fileSelectEl.value;
      const file = this.getInboxFiles().find((item) => item.path === value) ?? null;
      this.setSelectedFile(file);
    });
    this.infoEl = contentEl.createEl("div", { cls: "inbox-sorter-info" });
    new import_obsidian.Setting(contentEl).setName("Tags").setDesc("Comma-separated tags to apply").addText((text) => {
      this.tagsInputEl = text.inputEl;
      text.setPlaceholder("inbox, project-x");
    });
    new import_obsidian.Setting(contentEl).setName("Properties").setDesc("One per line: key: value").addTextArea((text) => {
      this.propertiesInputEl = text.inputEl;
      text.setPlaceholder("status: review\nowner: me");
      text.inputEl.addClass("inbox-sorter-properties");
    });
    const folderSetting = new import_obsidian.Setting(contentEl).setName("Move to folder").setDesc("Choose destination folder").addExtraButton(
      (button) => button.setIcon("refresh-cw").setTooltip("Refresh folders").onClick(() => this.refreshFolderList())
    );
    this.folderSelectEl = folderSetting.controlEl.createEl("select");
    this.folderSelectEl.addClass("inbox-sorter-select");
    this.folderSelectEl.addEventListener("change", () => {
      this.selectedFolder = this.folderSelectEl.value;
    });
    const buttons = contentEl.createEl("div", { cls: "inbox-sorter-actions" });
    const saveButton = buttons.createEl("button", { text: "Save properties", cls: "mod-cta" });
    const saveMoveButton = buttons.createEl("button", { text: "Save and move", cls: "mod-cta" });
    const cancelButton = buttons.createEl("button", { text: "Close" });
    saveButton.addEventListener("click", () => void this.applyChanges(false));
    saveMoveButton.addEventListener("click", () => void this.applyChanges(true));
    cancelButton.addEventListener("click", () => this.close());
    this.refreshFileList();
    this.refreshFolderList();
  }
  refreshFileList() {
    const files = this.getInboxFiles();
    this.fileSelectEl.empty();
    if (files.length === 0) {
      this.fileSelectEl.createEl("option", { text: "No inbox files", value: "" });
      this.setSelectedFile(null);
      return;
    }
    for (const file of files) {
      this.fileSelectEl.createEl("option", {
        text: file.path,
        value: file.path
      });
    }
    const initial = files[0];
    this.fileSelectEl.value = initial.path;
    this.setSelectedFile(initial);
  }
  refreshFolderList() {
    const folders = this.getFolders();
    this.folderSelectEl.empty();
    for (const folder of folders) {
      this.folderSelectEl.createEl("option", {
        text: folder,
        value: folder
      });
    }
    if (!folders.includes(this.selectedFolder)) {
      this.selectedFolder = this.plugin.settings.defaultTargetFolder;
    }
    if (folders.includes(this.selectedFolder)) {
      this.folderSelectEl.value = this.selectedFolder;
    }
  }
  getInboxFiles() {
    const inbox = (0, import_obsidian.normalizePath)(this.plugin.settings.inboxFolder);
    const files = this.app.vault.getMarkdownFiles();
    return files.filter(
      (file) => file.path === inbox || file.path.startsWith(`${inbox}/`)
    );
  }
  getFolders() {
    const folders = this.app.vault.getAllLoadedFiles().filter((item) => item instanceof import_obsidian.TFolder).map((folder) => folder.path).sort((a, b) => a.localeCompare(b));
    if (!folders.includes(this.plugin.settings.defaultTargetFolder)) {
      folders.unshift(this.plugin.settings.defaultTargetFolder);
    }
    return folders;
  }
  setSelectedFile(file) {
    this.selectedFile = file;
    if (!file) {
      this.infoEl.setText("No file selected.");
      this.tagsInputEl.value = "";
      this.propertiesInputEl.value = "";
      return;
    }
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter ?? {};
    const existingTags = this.plugin.extractTags(frontmatter.tags);
    const mergedTags = this.plugin.mergeTags(existingTags, this.plugin.getDefaultTags());
    this.tagsInput = mergedTags.join(", ");
    this.tagsInputEl.value = this.tagsInput;
    const properties = Object.entries(frontmatter).filter(([key]) => key !== "tags").map(([key, value]) => `${key}: ${formatFrontmatterValue(value)}`).join("\n");
    this.propertiesInput = properties;
    this.propertiesInputEl.value = this.propertiesInput;
    const infoLines = [
      `Path: ${file.path}`,
      `Size: ${file.stat.size} bytes`,
      `Created: ${new Date(file.stat.ctime).toLocaleString()}`,
      `Modified: ${new Date(file.stat.mtime).toLocaleString()}`
    ];
    this.infoEl.setText(infoLines.join("\n"));
  }
  async applyChanges(moveFile) {
    const file = this.selectedFile;
    if (!file) {
      new import_obsidian.Notice("Select a file first");
      return;
    }
    const tags = this.plugin.normalizeTags(this.tagsInputEl.value.split(","));
    const properties = parseProperties(this.propertiesInputEl.value);
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      if (tags.length > 0) {
        frontmatter.tags = this.plugin.mergeTags(this.plugin.extractTags(frontmatter.tags), tags);
      }
      for (const [key, value] of Object.entries(properties)) {
        frontmatter[key] = value;
      }
    });
    if (moveFile) {
      const targetFolder = (0, import_obsidian.normalizePath)(this.selectedFolder || this.plugin.settings.defaultTargetFolder);
      await ensureFolderExists(this.app, targetFolder);
      const newPath = (0, import_obsidian.normalizePath)(`${targetFolder}/${file.name}`);
      await this.app.vault.rename(file, newPath);
      new import_obsidian.Notice("Saved and moved the note");
    } else {
      new import_obsidian.Notice("Saved properties and tags");
    }
  }
};
async function ensureFolderExists(app, path) {
  const normalized = (0, import_obsidian.normalizePath)(path);
  if (app.vault.getAbstractFileByPath(normalized)) return;
  await app.vault.createFolder(normalized);
}
function parseProperties(input) {
  const result = {};
  const lines = input.split("\n").map((line) => line.trim());
  for (const line of lines) {
    if (!line || !line.includes(":")) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim();
    const value = rest.join(":").trim();
    if (!key) continue;
    result[key] = parsePropertyValue(value);
  }
  return result;
}
function parsePropertyValue(value) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (!Number.isNaN(Number(trimmed)) && trimmed !== "") return Number(trimmed);
  if (trimmed.startsWith("{") && trimmed.endsWith("}") || trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}
function formatFrontmatterValue(value) {
  if (value === null || value === void 0) return "";
  if (Array.isArray(value) || typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
//# sourceMappingURL=main.js.map
