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
  inboxFolders: ["Inbox"],
  destinationFolders: [],
  sortRules: []
};
var InboxSorterPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "inbox-sorter-process-inbox",
      name: "Process Inbox",
      checkCallback: (checking) => {
        if (!checking) {
          new ProcessInboxModal(this.app, this).open();
        }
        return true;
      }
    });
    this.addCommand({
      id: "inbox-sorter-auto-sort-inbox",
      name: "Auto-sort Inbox",
      checkCallback: (checking) => {
        if (!checking) {
          void this.autoSortInbox();
        }
        return true;
      }
    });
    this.addSettingTab(new InboxSorterSettingTab(this.app, this));
  }
  async autoSortInbox() {
    const files = collectInboxFiles(this.app, this.settings.inboxFolders);
    let movedCount = 0;
    for (const file of files) {
      const rule = this.findMatchingRule(file);
      if (!rule) continue;
      const destination = (0, import_obsidian.normalizePath)(rule.destination);
      const folder = this.app.vault.getAbstractFileByPath(destination);
      if (!(folder instanceof import_obsidian.TFolder)) {
        new import_obsidian.Notice(`Inbox Sorter: Destination not found: ${destination}`);
        continue;
      }
      const newPath = (0, import_obsidian.normalizePath)(`${destination}/${file.name}`);
      await this.app.vault.rename(file, newPath);
      movedCount += 1;
      new import_obsidian.Notice(`Auto-sorted: ${file.basename} \u2192 ${destination}`);
    }
    new import_obsidian.Notice(`Inbox auto-sort complete. ${movedCount} notes moved.`);
  }
  findMatchingRule(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter ?? {};
    for (const rule of this.settings.sortRules) {
      const property = rule.property.trim();
      if (!property) continue;
      const expected = rule.value.trim();
      const actual = frontmatter[property];
      if (String(actual) === expected) {
        return rule;
      }
    }
    return null;
  }
  isInInboxFolder(file) {
    const parentPath = file.parent?.path ?? "";
    return this.settings.inboxFolders.some(
      (folder) => (0, import_obsidian.normalizePath)(folder) === parentPath
    );
  }
  getVaultFolders() {
    return this.app.vault.getAllLoadedFiles().filter((item) => item instanceof import_obsidian.TFolder).map((folder) => folder.path).sort((a, b) => a.localeCompare(b));
  }
  getAvailableDestinationFolders() {
    const destinations = this.settings.destinationFolders.map((folder) => folder.trim()).filter(Boolean);
    if (destinations.length > 0) {
      return destinations;
    }
    const inboxSet = new Set(
      this.settings.inboxFolders.map((folder) => (0, import_obsidian.normalizePath)(folder))
    );
    return this.getVaultFolders().filter((folder) => !inboxSet.has(folder));
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
    this.renderFolderList(
      containerEl,
      "Inbox Folders",
      "Folders containing unsorted notes",
      this.plugin.settings.inboxFolders,
      async (value) => {
        this.plugin.settings.inboxFolders = value;
        await this.plugin.saveSettings();
      },
      "+ Add Inbox Folder"
    );
    this.renderFolderList(
      containerEl,
      "Destination Folders",
      "Folders notes can be moved to",
      this.plugin.settings.destinationFolders,
      async (value) => {
        this.plugin.settings.destinationFolders = value;
        await this.plugin.saveSettings();
      },
      "+ Add Destination Folder"
    );
    this.renderSortRules(containerEl);
  }
  renderFolderList(containerEl, title, description, values, onChange, addLabel) {
    containerEl.createEl("h3", { text: title });
    containerEl.createEl("p", { text: description });
    const listEl = containerEl.createEl("div", { cls: "inbox-sorter-list" });
    const renderList = () => {
      listEl.empty();
      values.forEach((value, index) => {
        const setting = new import_obsidian.Setting(listEl);
        const inputEl = setting.controlEl.createEl("input", { type: "text" });
        inputEl.value = value;
        attachFolderAutocomplete(inputEl, () => this.plugin.getVaultFolders());
        inputEl.addEventListener("input", async () => {
          values[index] = inputEl.value.trim();
          await onChange([...values.filter((item) => item.length > 0)]);
        });
        setting.addExtraButton(
          (button) => button.setIcon("x").setTooltip("Remove").onClick(async () => {
            values.splice(index, 1);
            await onChange([...values]);
            renderList();
          })
        );
      });
    };
    renderList();
    new import_obsidian.Setting(containerEl).addButton(
      (button) => button.setButtonText(addLabel).setCta().onClick(async () => {
        values.push("");
        await onChange([...values]);
        renderList();
      })
    );
  }
  renderSortRules(containerEl) {
    containerEl.createEl("h3", { text: "Sort Rules" });
    containerEl.createEl("p", {
      text: "Match a frontmatter property to move notes to a destination folder."
    });
    const listEl = containerEl.createEl("div", { cls: "inbox-sorter-list" });
    const renderRules = () => {
      listEl.empty();
      this.plugin.settings.sortRules.forEach((rule, index) => {
        const setting = new import_obsidian.Setting(listEl);
        const propertyEl = setting.controlEl.createEl("input", { type: "text" });
        propertyEl.value = rule.property;
        attachPropertyAutocomplete(propertyEl, () => collectFrontmatterKeys(this.plugin.app));
        propertyEl.addEventListener("input", async () => {
          rule.property = propertyEl.value;
          await this.plugin.saveSettings();
        });
        const valueEl = setting.controlEl.createEl("input", { type: "text" });
        valueEl.value = rule.value;
        valueEl.addEventListener("input", async () => {
          rule.value = valueEl.value;
          await this.plugin.saveSettings();
        });
        const destinationEl = setting.controlEl.createEl("input", { type: "text" });
        destinationEl.value = rule.destination;
        attachFolderAutocomplete(destinationEl, () => this.plugin.getVaultFolders());
        destinationEl.addEventListener("input", async () => {
          rule.destination = destinationEl.value;
          await this.plugin.saveSettings();
        });
        setting.addExtraButton(
          (button) => button.setIcon("x").setTooltip("Remove").onClick(async () => {
            this.plugin.settings.sortRules.splice(index, 1);
            await this.plugin.saveSettings();
            renderRules();
          })
        );
      });
    };
    renderRules();
    new import_obsidian.Setting(containerEl).addButton(
      (button) => button.setButtonText("+ Add Rule").setCta().onClick(async () => {
        this.plugin.settings.sortRules.push({
          property: "",
          value: "",
          destination: ""
        });
        await this.plugin.saveSettings();
        renderRules();
      })
    );
  }
};
var ProcessInboxModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.files = [];
    this.index = 0;
    this.movedCount = 0;
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("inbox-sorter-modal");
    contentEl.createEl("h2", { text: "Process Inbox" });
    this.titleEl = contentEl.createEl("div", { cls: "inbox-sorter-title" });
    this.counterEl = contentEl.createEl("div", { cls: "inbox-sorter-counter" });
    new import_obsidian.Setting(contentEl).setName("Destination folder").setDesc("Choose where to move this note").addText((text) => {
      this.destinationInput = text.inputEl;
      attachFolderAutocomplete(this.destinationInput, () => this.getDestinationOptions());
    });
    const actions = contentEl.createEl("div", { cls: "inbox-sorter-actions" });
    const moveButton = actions.createEl("button", { text: "Move & Next", cls: "mod-cta" });
    const skipButton = actions.createEl("button", { text: "Skip" });
    const stopButton = actions.createEl("button", { text: "Stop" });
    moveButton.addEventListener("click", () => void this.moveAndNext());
    skipButton.addEventListener("click", () => void this.next());
    stopButton.addEventListener("click", () => this.finish());
    this.files = this.collectInboxFiles();
    this.index = 0;
    this.movedCount = 0;
    void this.showCurrent();
  }
  getDestinationOptions() {
    return this.plugin.getAvailableDestinationFolders();
  }
  collectInboxFiles() {
    return collectInboxFiles(this.app, this.plugin.settings.inboxFolders);
  }
  async showCurrent() {
    if (this.files.length === 0) {
      this.close();
      new import_obsidian.Notice("Inbox processed. 0 notes moved.");
      return;
    }
    if (this.index >= this.files.length) {
      this.finish();
      return;
    }
    const file = this.files[this.index];
    this.titleEl.setText(file.basename);
    this.counterEl.setText(`Note ${this.index + 1} of ${this.files.length}`);
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { active: true });
  }
  async moveAndNext() {
    const file = this.files[this.index];
    const destination = (0, import_obsidian.normalizePath)(this.destinationInput.value.trim());
    if (!destination) {
      new import_obsidian.Notice("Select a destination folder");
      return;
    }
    const folder = this.app.vault.getAbstractFileByPath(destination);
    if (!(folder instanceof import_obsidian.TFolder)) {
      new import_obsidian.Notice(`Destination not found: ${destination}`);
      await this.next();
      return;
    }
    const newPath = (0, import_obsidian.normalizePath)(`${destination}/${file.name}`);
    await this.app.vault.rename(file, newPath);
    this.movedCount += 1;
    await this.next();
  }
  async next() {
    this.index += 1;
    await this.showCurrent();
  }
  finish() {
    this.close();
    new import_obsidian.Notice(`Inbox processed. ${this.movedCount} notes moved.`);
  }
};
function attachFolderAutocomplete(inputEl, getOptions) {
  attachAutocomplete(inputEl, getOptions);
}
function attachPropertyAutocomplete(inputEl, getOptions) {
  attachAutocomplete(inputEl, getOptions);
}
function attachAutocomplete(inputEl, getOptions) {
  let dropdown = null;
  const closeDropdown = () => {
    dropdown?.remove();
    dropdown = null;
  };
  const openDropdown = (matches) => {
    closeDropdown();
    if (matches.length === 0) return;
    dropdown = inputEl.parentElement?.createDiv({ cls: "inbox-sorter-autocomplete" }) ?? null;
    if (!dropdown) return;
    matches.slice(0, 20).forEach((option) => {
      const item = dropdown.createDiv({ cls: "inbox-sorter-autocomplete-item" });
      item.setText(option);
      item.addEventListener("click", () => {
        inputEl.value = option;
        inputEl.dispatchEvent(new Event("input"));
        closeDropdown();
      });
    });
  };
  inputEl.addEventListener("input", () => {
    const query = inputEl.value.toLowerCase();
    const options = getOptions();
    const matches = options.filter((option) => option.toLowerCase().includes(query));
    openDropdown(matches);
  });
  inputEl.addEventListener("focus", () => {
    const options = getOptions();
    openDropdown(options);
  });
  inputEl.addEventListener("blur", () => {
    setTimeout(closeDropdown, 150);
  });
}
function collectFrontmatterKeys(app) {
  const keys = /* @__PURE__ */ new Set();
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter ?? {};
    Object.keys(frontmatter).forEach((key) => keys.add(key));
  }
  return Array.from(keys.values()).sort((a, b) => a.localeCompare(b));
}
function collectInboxFiles(app, inboxFolders) {
  const files = [];
  const targets = inboxFolders.length ? inboxFolders : ["Inbox"];
  for (const folderPath of targets) {
    const folder = app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(folderPath));
    if (folder instanceof import_obsidian.TFolder) {
      for (const child of folder.children) {
        if (child instanceof import_obsidian.TFile && child.extension === "md") {
          files.push(child);
        }
      }
    }
  }
  return files;
}
//# sourceMappingURL=main.js.map
