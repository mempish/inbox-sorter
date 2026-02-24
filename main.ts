import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
} from "obsidian";

type TagInputMode = "prepend-hash" | "raw";

interface InboxSorterSettings {
  inboxFolder: string;
  processedFolder: string;
  defaultTags: string;
  tagInputMode: TagInputMode;
  addTimestampTag: boolean;
  timestampTagFormat: string;
}

const DEFAULT_SETTINGS: InboxSorterSettings = {
  inboxFolder: "Inbox",
  processedFolder: "Notes",
  defaultTags: "inbox",
  tagInputMode: "prepend-hash",
  addTimestampTag: false,
  timestampTagFormat: "yyyy-MM-dd",
};

export default class InboxSorterPlugin extends Plugin {
  settings!: InboxSorterSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "inbox-sorter-tag-active",
      name: "Add default tags to active note",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          void this.addTagsToFile(file, this.getDefaultTags());
        }
        return true;
      },
    });

    this.addCommand({
      id: "inbox-sorter-tag-and-file",
      name: "Tag and file active note",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          void this.tagAndFile(file);
        }
        return true;
      },
    });

    this.addCommand({
      id: "inbox-sorter-add-tags-prompt",
      name: "Add tags to active note (prompt)",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) {
          void this.addTagsFromPrompt(file);
        }
        return true;
      },
    });

    this.addSettingTab(new InboxSorterSettingTab(this.app, this));
  }

  async addTagsFromPrompt(file: TFile) {
    const value = window.prompt("Enter tags (comma-separated)");
    if (!value) return;
    const tags = this.normalizeTags(value.split(","));
    await this.addTagsToFile(file, tags);
  }

  async tagAndFile(file: TFile) {
    const tags = this.getDefaultTags();
    await this.addTagsToFile(file, tags);
    await this.moveFileOutOfInbox(file);
  }

  async addTagsToFile(file: TFile, tags: string[]) {
    if (tags.length === 0) {
      new Notice("No tags provided");
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

    new Notice(`Added tags to ${file.basename}`);
  }

  async moveFileOutOfInbox(file: TFile) {
    const inboxPath = normalizePath(this.settings.inboxFolder);
    const targetFolder = normalizePath(this.settings.processedFolder);

    if (!file.path.startsWith(`${inboxPath}/`) && file.path !== inboxPath) {
      new Notice("Active note is not in the inbox folder");
      return;
    }

    await ensureFolderExists(this.app, targetFolder);
    const newPath = normalizePath(`${targetFolder}/${file.name}`);
    await this.app.vault.rename(file, newPath);
    new Notice(`Moved to ${targetFolder}`);
  }

  getDefaultTags(): string[] {
    return this.normalizeTags(this.settings.defaultTags.split(","));
  }

  normalizeTags(rawTags: string[]): string[] {
    return rawTags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .map((tag) => this.normalizeTag(tag));
  }

  normalizeTag(tag: string): string {
    if (this.settings.tagInputMode === "raw") {
      return tag.replace(/^#/, "");
    }
    return tag.startsWith("#") ? tag.slice(1) : tag;
  }

  extractTags(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((tag) => String(tag));
    }
    if (typeof value === "string") {
      return value.split(",").map((tag) => tag.trim());
    }
    return [];
  }

  mergeTags(existing: string[], incoming: string[]): string[] {
    const set = new Set(existing.map((tag) => this.normalizeTag(tag)));
    for (const tag of incoming) {
      set.add(this.normalizeTag(tag));
    }
    return Array.from(set.values());
  }

  formatDateTag(format: string): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const replacements: Record<string, string> = {
      yyyy: String(now.getFullYear()),
      MM: pad(now.getMonth() + 1),
      dd: pad(now.getDate()),
      HH: pad(now.getHours()),
      mm: pad(now.getMinutes()),
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
}

class InboxSorterSettingTab extends PluginSettingTab {
  plugin: InboxSorterPlugin;

  constructor(app: App, plugin: InboxSorterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.createEl("h2", { text: "Inbox Sorter Settings" });

    new Setting(containerEl)
      .setName("Inbox folder")
      .setDesc("Folder containing notes to process")
      .addText((text) =>
        text
          .setPlaceholder("Inbox")
          .setValue(this.plugin.settings.inboxFolder)
          .onChange(async (value) => {
            this.plugin.settings.inboxFolder = value.trim() || "Inbox";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Processed folder")
      .setDesc("Destination folder for filed notes")
      .addText((text) =>
        text
          .setPlaceholder("Notes")
          .setValue(this.plugin.settings.processedFolder)
          .onChange(async (value) => {
            this.plugin.settings.processedFolder = value.trim() || "Notes";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default tags")
      .setDesc("Comma-separated tags to apply when filing notes")
      .addTextArea((text) =>
        text
          .setPlaceholder("inbox, to-process")
          .setValue(this.plugin.settings.defaultTags)
          .onChange(async (value) => {
            this.plugin.settings.defaultTags = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Tag input mode")
      .setDesc("How tag input is interpreted")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("prepend-hash", "Strip leading #")
          .addOption("raw", "Keep raw tag text")
          .setValue(this.plugin.settings.tagInputMode)
          .onChange(async (value: TagInputMode) => {
            this.plugin.settings.tagInputMode = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Add timestamp tag")
      .setDesc("Optionally add a timestamp tag when filing notes")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.addTimestampTag)
          .onChange(async (value) => {
            this.plugin.settings.addTimestampTag = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Timestamp tag format")
      .setDesc("Use tokens: yyyy, MM, dd, HH, mm")
      .addText((text) =>
        text
          .setPlaceholder("yyyy-MM-dd")
          .setValue(this.plugin.settings.timestampTagFormat)
          .onChange(async (value) => {
            this.plugin.settings.timestampTagFormat = value.trim() || "yyyy-MM-dd";
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("p", {
      text: "Commands are available in the command palette.",
      cls: "inbox-sorter-hint",
    });
  }
}

async function ensureFolderExists(app: App, path: string) {
  const normalized = normalizePath(path);
  if (app.vault.getAbstractFileByPath(normalized)) return;
  await app.vault.createFolder(normalized);
}
