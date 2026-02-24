import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  normalizePath,
} from "obsidian";

interface InboxSorterSettings {
  inboxFolders: string[];
  destinationFolders: string[];
  sortRules: SortRule[];
  autoSortEnabled: boolean;
}

interface SortRule {
  property: string;
  value: string;
  destination: string;
}

const DEFAULT_SETTINGS: InboxSorterSettings = {
  inboxFolders: ["Inbox"],
  destinationFolders: [],
  sortRules: [],
  autoSortEnabled: false,
};

export default class InboxSorterPlugin extends Plugin {
  settings!: InboxSorterSettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "inbox-sorter-process-inbox",
      name: "Process Inbox",
      checkCallback: (checking: boolean) => {
        if (!checking) {
          new ProcessInboxModal(this.app, this).open();
        }
        return true;
      },
    });

    this.addSettingTab(new InboxSorterSettingTab(this.app, this));

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile) {
          void this.autoSortFile(file);
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) {
          void this.autoSortFile(file);
        }
      })
    );
  }

  async autoSortFile(file: TFile) {
    if (!this.settings.autoSortEnabled) return;
    if (!this.isInInboxFolder(file)) return;

    const rule = this.findMatchingRule(file);
    if (!rule) return;

    const destination = normalizePath(rule.destination);
    const folder = this.app.vault.getAbstractFileByPath(destination);
    if (!(folder instanceof TFolder)) {
      new Notice(`Inbox Sorter: Destination not found: ${destination}`);
      return;
    }

    const newPath = normalizePath(`${destination}/${file.name}`);
    await this.app.vault.rename(file, newPath);
    new Notice(`Auto-sorted: ${file.basename} → ${destination}`);
  }

  findMatchingRule(file: TFile): SortRule | null {
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

  isInInboxFolder(file: TFile): boolean {
    const parentPath = file.parent?.path ?? "";
    return this.settings.inboxFolders.some(
      (folder) => normalizePath(folder) === parentPath
    );
  }

  getVaultFolders(): string[] {
    return this.app.vault
      .getAllLoadedFiles()
      .filter((item): item is TFolder => item instanceof TFolder)
      .map((folder) => folder.path)
      .sort((a, b) => a.localeCompare(b));
  }

  getAvailableDestinationFolders(): string[] {
    const destinations = this.settings.destinationFolders
      .map((folder) => folder.trim())
      .filter(Boolean);

    if (destinations.length > 0) {
      return destinations;
    }

    const inboxSet = new Set(
      this.settings.inboxFolders.map((folder) => normalizePath(folder))
    );
    return this.getVaultFolders().filter((folder) => !inboxSet.has(folder));
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

    new Setting(containerEl)
      .setName("Auto-sort")
      .setDesc("Automatically move notes on save/create")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoSortEnabled)
          .onChange(async (value) => {
            this.plugin.settings.autoSortEnabled = value;
            await this.plugin.saveSettings();
          })
      );
  }

  renderFolderList(
    containerEl: HTMLElement,
    title: string,
    description: string,
    values: string[],
    onChange: (value: string[]) => Promise<void>,
    addLabel: string
  ) {
    containerEl.createEl("h3", { text: title });
    containerEl.createEl("p", { text: description });

    const listEl = containerEl.createEl("div", { cls: "inbox-sorter-list" });

    const renderList = () => {
      listEl.empty();
      values.forEach((value, index) => {
        const setting = new Setting(listEl);
        const inputEl = setting.controlEl.createEl("input", { type: "text" });
        inputEl.value = value;
        attachFolderAutocomplete(inputEl, () => this.plugin.getVaultFolders());
        inputEl.addEventListener("input", async () => {
          values[index] = inputEl.value.trim();
          await onChange([...values.filter((item) => item.length > 0)]);
        });

        setting.addExtraButton((button) =>
          button
            .setIcon("x")
            .setTooltip("Remove")
            .onClick(async () => {
              values.splice(index, 1);
              await onChange([...values]);
              renderList();
            })
        );
      });
    };

    renderList();

    new Setting(containerEl).addButton((button) =>
      button
        .setButtonText(addLabel)
        .setCta()
        .onClick(async () => {
          values.push("");
          await onChange([...values]);
          renderList();
        })
    );
  }

  renderSortRules(containerEl: HTMLElement) {
    containerEl.createEl("h3", { text: "Sort Rules" });
    containerEl.createEl("p", {
      text: "Match a frontmatter property to move notes to a destination folder.",
    });

    const listEl = containerEl.createEl("div", { cls: "inbox-sorter-list" });

    const renderRules = () => {
      listEl.empty();
      this.plugin.settings.sortRules.forEach((rule, index) => {
        const setting = new Setting(listEl);

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

        setting.addExtraButton((button) =>
          button
            .setIcon("x")
            .setTooltip("Remove")
            .onClick(async () => {
              this.plugin.settings.sortRules.splice(index, 1);
              await this.plugin.saveSettings();
              renderRules();
            })
        );
      });
    };

    renderRules();

    new Setting(containerEl).addButton((button) =>
      button
        .setButtonText("+ Add Rule")
        .setCta()
        .onClick(async () => {
          this.plugin.settings.sortRules.push({
            property: "",
            value: "",
            destination: "",
          });
          await this.plugin.saveSettings();
          renderRules();
        })
    );
  }
}

class ProcessInboxModal extends Modal {
  plugin: InboxSorterPlugin;
  files: TFile[] = [];
  index = 0;
  movedCount = 0;

  counterEl!: HTMLElement;
  titleEl!: HTMLElement;
  destinationInput!: HTMLInputElement;

  constructor(app: App, plugin: InboxSorterPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("inbox-sorter-modal");

    contentEl.createEl("h2", { text: "Process Inbox" });
    this.titleEl = contentEl.createEl("div", { cls: "inbox-sorter-title" });
    this.counterEl = contentEl.createEl("div", { cls: "inbox-sorter-counter" });

    new Setting(contentEl)
      .setName("Destination folder")
      .setDesc("Choose where to move this note")
      .addText((text) => {
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

  getDestinationOptions(): string[] {
    return this.plugin.getAvailableDestinationFolders();
  }

  collectInboxFiles(): TFile[] {
    const files: TFile[] = [];
    for (const folderPath of this.plugin.settings.inboxFolders) {
      const folder = this.app.vault.getAbstractFileByPath(normalizePath(folderPath));
      if (folder instanceof TFolder) {
        for (const child of folder.children) {
          if (child instanceof TFile && child.extension === "md") {
            files.push(child);
          }
        }
      }
    }
    return files;
  }

  async showCurrent() {
    if (this.files.length === 0 || this.index >= this.files.length) {
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
    const destination = normalizePath(this.destinationInput.value.trim());
    if (!destination) {
      new Notice("Select a destination folder");
      return;
    }

    const folder = this.app.vault.getAbstractFileByPath(destination);
    if (!(folder instanceof TFolder)) {
      new Notice(`Destination not found: ${destination}`);
      await this.next();
      return;
    }

    const newPath = normalizePath(`${destination}/${file.name}`);
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
    new Notice(`Inbox processed. ${this.movedCount} notes moved.`);
  }
}

function attachFolderAutocomplete(
  inputEl: HTMLInputElement,
  getOptions: () => string[]
) {
  attachAutocomplete(inputEl, getOptions);
}

function attachPropertyAutocomplete(
  inputEl: HTMLInputElement,
  getOptions: () => string[]
) {
  attachAutocomplete(inputEl, getOptions);
}

function attachAutocomplete(
  inputEl: HTMLInputElement,
  getOptions: () => string[]
) {
  let dropdown: HTMLDivElement | null = null;

  const closeDropdown = () => {
    dropdown?.remove();
    dropdown = null;
  };

  const openDropdown = (matches: string[]) => {
    closeDropdown();
    if (matches.length === 0) return;

    dropdown = inputEl.parentElement?.createDiv({ cls: "inbox-sorter-autocomplete" }) ?? null;
    if (!dropdown) return;

    matches.slice(0, 20).forEach((option) => {
      const item = dropdown!.createDiv({ cls: "inbox-sorter-autocomplete-item" });
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

function collectFrontmatterKeys(app: App): string[] {
  const keys = new Set<string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter ?? {};
    Object.keys(frontmatter).forEach((key) => keys.add(key));
  }
  return Array.from(keys.values()).sort((a, b) => a.localeCompare(b));
}
