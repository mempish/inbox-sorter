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
  processedFolder: "Notes",
  defaultTags: "inbox",
  tagInputMode: "prepend-hash",
  addTimestampTag: false,
  timestampTagFormat: "yyyy-MM-dd"
};
var InboxSorterPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "inbox-sorter-tag-active",
      name: "Add default tags to active note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          void this.addTagsToFile(file, this.getDefaultTags());
        }
        return true;
      }
    });
    this.addCommand({
      id: "inbox-sorter-tag-and-file",
      name: "Tag and file active note",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          void this.tagAndFile(file);
        }
        return true;
      }
    });
    this.addCommand({
      id: "inbox-sorter-add-tags-prompt",
      name: "Add tags to active note (prompt)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          void this.addTagsFromPrompt(file);
        }
        return true;
      }
    });
    this.addSettingTab(new InboxSorterSettingTab(this.app, this));
  }
  async addTagsFromPrompt(file) {
    const value = window.prompt("Enter tags (comma-separated)");
    if (!value) return;
    const tags = this.normalizeTags(value.split(","));
    await this.addTagsToFile(file, tags);
  }
  async tagAndFile(file) {
    const tags = this.getDefaultTags();
    await this.addTagsToFile(file, tags);
    await this.moveFileOutOfInbox(file);
  }
  async addTagsToFile(file, tags) {
    if (tags.length === 0) {
      new import_obsidian.Notice("No tags provided");
      return;
    }
    const fileManager = this.app.fileManager;
    await fileManager.processFrontMatter(file, (frontmatter) => {
      const existing = this.extractTags(frontmatter.tags);
      const merged = this.mergeTags(existing, tags);
      if (this.settings.addTimestampTag) {
        const stamp = this.formatDateTag(this.settings.timestampTagFormat);
        merged.push(this.normalizeTag(stamp));
      }
      frontmatter.tags = merged;
    });
    new import_obsidian.Notice(`Added tags to ${file.basename}`);
  }
  async moveFileOutOfInbox(file) {
    const inboxPath = (0, import_obsidian.normalizePath)(this.settings.inboxFolder);
    const targetFolder = (0, import_obsidian.normalizePath)(this.settings.processedFolder);
    if (!file.path.startsWith(`${inboxPath}/`) && file.path !== inboxPath) {
      new import_obsidian.Notice("Active note is not in the inbox folder");
      return;
    }
    await ensureFolderExists(this.app, targetFolder);
    const newPath = (0, import_obsidian.normalizePath)(`${targetFolder}/${file.name}`);
    await this.app.vault.rename(file, newPath);
    new import_obsidian.Notice(`Moved to ${targetFolder}`);
  }
  getDefaultTags() {
    return this.normalizeTags(this.settings.defaultTags.split(","));
  }
  normalizeTags(rawTags) {
    return rawTags.map((tag) => tag.trim()).filter((tag) => tag.length > 0).map((tag) => this.normalizeTag(tag));
  }
  normalizeTag(tag) {
    if (this.settings.tagInputMode === "raw") {
      return tag.replace(/^#/, "");
    }
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
  formatDateTag(format) {
    const now = /* @__PURE__ */ new Date();
    const pad = (value) => String(value).padStart(2, "0");
    const replacements = {
      yyyy: String(now.getFullYear()),
      MM: pad(now.getMonth() + 1),
      dd: pad(now.getDate()),
      HH: pad(now.getHours()),
      mm: pad(now.getMinutes())
    };
    let result = format;
    for (const [token, replacement] of Object.entries(replacements)) {
      result = result.replaceAll(token, replacement);
    }
    return result;
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
    new import_obsidian.Setting(containerEl).setName("Processed folder").setDesc("Destination folder for filed notes").addText(
      (text) => text.setPlaceholder("Notes").setValue(this.plugin.settings.processedFolder).onChange(async (value) => {
        this.plugin.settings.processedFolder = value.trim() || "Notes";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Default tags").setDesc("Comma-separated tags to apply when filing notes").addTextArea(
      (text) => text.setPlaceholder("inbox, to-process").setValue(this.plugin.settings.defaultTags).onChange(async (value) => {
        this.plugin.settings.defaultTags = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Tag input mode").setDesc("How tag input is interpreted").addDropdown(
      (dropdown) => dropdown.addOption("prepend-hash", "Strip leading #").addOption("raw", "Keep raw tag text").setValue(this.plugin.settings.tagInputMode).onChange(async (value) => {
        this.plugin.settings.tagInputMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Add timestamp tag").setDesc("Optionally add a timestamp tag when filing notes").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.addTimestampTag).onChange(async (value) => {
        this.plugin.settings.addTimestampTag = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Timestamp tag format").setDesc("Use tokens: yyyy, MM, dd, HH, mm").addText(
      (text) => text.setPlaceholder("yyyy-MM-dd").setValue(this.plugin.settings.timestampTagFormat).onChange(async (value) => {
        this.plugin.settings.timestampTagFormat = value.trim() || "yyyy-MM-dd";
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("p", {
      text: "Commands are available in the command palette.",
      cls: "inbox-sorter-hint"
    });
  }
};
async function ensureFolderExists(app, path) {
  const normalized = (0, import_obsidian.normalizePath)(path);
  if (app.vault.getAbstractFileByPath(normalized)) return;
  await app.vault.createFolder(normalized);
}
//# sourceMappingURL=main.js.map
