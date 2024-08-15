import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { json } from 'stream/consumers';

export class ItemTreeProvider implements vscode.TreeDataProvider<Item> {

  private _onDidChangeTreeData: vscode.EventEmitter<Item | undefined | void> = new vscode.EventEmitter<Item | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<Item | undefined | void> = this._onDidChangeTreeData.event;
  // Map to cache items with keys as a combination of filePath and JSONPath
  private itemCache: Map<string, Item> = new Map();

  constructor(private rootPath: string, private schema: any) {
    console.log(schema)

  }

  getParent(element: Item): vscode.ProviderResult<Item> {
    // Get the parent JSON file path
    const parentFile = element.filePath;
    const jsonPath = element.jsonPath;

    // Get the parent item from the cache
    return this.getCachedItem(parentFile, jsonPath.slice(0, -1));
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getItem(filePath: string, jsonPath: string[]): Item | undefined {
    return this.getCachedItem(filePath, jsonPath);
  }

  private createCacheKey(filePath: string, jsonPath: string[]): string {
    return `${filePath}:${jsonPath.join(',')}`;
  }

  private cacheItem(item: Item): void {
    const key = this.createCacheKey(item.filePath, item.jsonPath);
    this.itemCache.set(key, item);
  }

  getCachedItem(filePath: string, jsonPath: string[]): Item | undefined {
    const key = this.createCacheKey(filePath, jsonPath);
    return this.itemCache.get(key);
  }

  getTreeItem(element: Item): vscode.TreeItem {
    // Update the Ids
    //const data = fs.readFileSync(element.filePath, 'utf8');
    //if (JSON.parse(data).$tags) {
    //  element.$tags = JSON.parse(data).$tags;
    //  if (element.ui_type === 'dropdown-select-tag' || element.ui_type === 'pool-dropdown-select-tag') {
    //    const prevValue = element.value;
    //    if (element.value) {
    //      element.value = element.$tags.filter((tag: any) => element.value.includes(tag.$id)).map((tag: any) => tag.$id);
    //      if (JSON.stringify(element.value) !== JSON.stringify(prevValue)) {
    //        this.updateItem(element);
    //      }
    //    }
    //  }
    //}
    return element;
  }


  private decodeChildrenFromJson(jsonObject: any, parent: Item): void {
    let schema = parent.schema;

    const createItem = (key: string, keyProperties: any, jsonPath: string[], label: string): Item => {
      return new Item(
        label,
        key,
        keyProperties,
        parent.filePath,
        jsonPath,
        vscode.TreeItemCollapsibleState.Collapsed
      );
    };

    const addItemToParent = (item: Item, format: string): void => {
      switch (format) {
        case 'parent-object':
        case 'array-parent-objects':
          parent.children.push(item);
          break;
        case 'hidden':
        case 'pool-dropdown-select-tag':
        case 'dropdown-select-tag':
        case 'input-string':
        case 'checkbox':
        case 'dropdown-select':
          parent.hidden_children.push(item);
          break;
        case 'sub-object':
          // Decode the sub-object
          this.decodeChildrenFromJson(item.value, item);
          parent.hidden_children.push(item);
          break;
        default:
          vscode.window.showErrorMessage(`Type ${format} is not supported`);
          break;
      }
    };

    const processArray = (array: any[]): void => {
      array.forEach((itemValue, index) => {
        const itemSchema = schema.items;
        const item = createItem(index.toString(), itemSchema, parent.jsonPath.concat(index.toString()), itemValue?.$label);

        if (itemValue !== undefined) {
          item.value = itemValue;
        }

        addItemToParent(item, itemSchema.format);

        // Cache the item
        this.cacheItem(item);

      });
    };

    const processObject = (object: { [key: string]: any }): void => {
      const properties = schema.properties;

      for (const key in object) {
        if (object.hasOwnProperty(key)) {
          const keyProperties = properties[key];
          const jsonKey = object[key];
          const item = createItem(key, keyProperties, parent.jsonPath.concat(key), key);

          if (jsonKey !== undefined) {
            item.value = jsonKey;
          }

          addItemToParent(item, keyProperties.format);

          // Cache the item
          this.cacheItem(item);
        }
      }
    };

    if (Array.isArray(jsonObject)) {
      processArray(jsonObject);
    } else if (typeof jsonObject === 'object' && jsonObject !== null) {
      processObject(jsonObject);
    } else {
      vscode.window.showErrorMessage('Unsupported JSON data type');
    }

    // Check if parent has any children
    if (parent.children.length === 0) {
      parent.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
  }


  async getChildren(element?: Item): Promise<Item[]> {
    if (!this.rootPath) {
      vscode.window.showInformationMessage('No folder or workspace opened');
      return [];
    }

    if (!element) {
      // Find all .json files in the rootPath
      const files = fs.readdirSync(this.rootPath);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      // Get the parent items
      const ParentItems = jsonFiles.map(file => new Item(
        path.basename(file, '.json'),
        this.schema.title,
        this.schema,
        path.join(this.rootPath, file), // Pass the parent JSON file path
        [],  // Root path
        //this.collapsibleStateMap.get(path.join(this.rootPath, file))
        vscode.TreeItemCollapsibleState.Collapsed
      ));

      return ParentItems;
      //return ParentItems.filter(item => item.visible); // Filter by visibility
    } else {
      // Get the parent item's JSON file
      const parentJSON = JSON.parse(fs.readFileSync(element.filePath, 'utf-8')); // Read the parent JSON file

      // Drill down to the desired part of the JSON
      const jsonObject = element.jsonPath.reduce((obj, key) => obj[key], parentJSON);

      // Get the children of the parent item
      this.decodeChildrenFromJson(jsonObject, element);
      return element.children;
      //return children.filter(item => item.visible); // Filter by visibility
    }
  }

  private createChildrenFromSchema(schema: any, parentJSON: any, name?: string): { [key: string]: any } {
    const children: { [key: string]: any } = {};
    let isTag = false;

    for (const key in schema.properties) {
      const property = schema.properties[key];
      const type = property.type;

      if (key === '$label') {
        children.$label = name || '';
      } else if (key === '$id') {
        children.$id = generateUUID();
      } else if (key === '$tag') {
        children.$tag = property.const;
        isTag = true;
      } else if (type === 'string') {
        children[key] = '';
      } else if (type === 'number') {
        children[key] = 0;
      } else if (type === 'boolean') {
        children[key] = false;
      } else if (type === 'array') {
        children[key] = [];
      } else if (type === 'object') {
        children[key] = this.createChildrenFromSchema(property, parentJSON);
      } else {
        vscode.window.showWarningMessage(`Type ${type} in property ${key} is not supported`);
      }
    }

    if (isTag) {
      //Look for $tags in the parentJSON and add the new tag
      if (parentJSON.$tags) {
        //Create object for the tags
        const obj = {
          $tag: children.$tag,
          $label: children.$label,
          $id: children.$id
        }
        parentJSON.$tags.push(obj);
      }
    }

    return children;
  }

  async createParent(): Promise<void> {
    if (!this.rootPath) {
      vscode.window.showInformationMessage('No folder or workspace opened');
      return;
    }

    // Ask for the name of the parent object
    const name = await vscode.window.showInputBox({ prompt: 'Enter parent object name' });
    if (!name) {
      // Send a warning message if the user cancels the input box
      vscode.window.showWarningMessage('Parent object creation cancelled');
      return;
    }

    // Check if type is object
    if (this.schema.type !== 'object') {
      vscode.window.showErrorMessage('Parent object can only be created for type object');
      return;
    }

    //Create the json file
    const parentJSONfile = path.join(this.rootPath, `${name}.json`);

    //Now open the file and write the parent object
    const parentJSON = this.createChildrenFromSchema(this.schema, parentJSONfile, name);

    try {
      fs.writeFileSync(parentJSONfile, JSON.stringify(parentJSON, null, 2), 'utf-8');
      vscode.window.showInformationMessage(`Parent object ${name} created successfully!`);
      this.refresh();
    } catch (error) {
      // Type assertion to handle 'unknown' type
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to create parent object: ${errorMessage}`);
    }
  }

  async createChildFrom(parent: Item): Promise<void> {
    if (!this.rootPath) {
      vscode.window.showInformationMessage('No folder or workspace opened');
      return;
    }

    if (!parent.schema.items) {
      vscode.window.showErrorMessage('Child object can only be created for array with items');
      return;
    }

    const childName = await vscode.window.showInputBox({ prompt: 'Enter child object name' });
    if (!childName) {
      vscode.window.showWarningMessage('Child object creation cancelled');
      return;
    }

    const parentJSON = JSON.parse(fs.readFileSync(parent.filePath, 'utf-8'));
    const jsonPath = parent.jsonPath;

    // Create child object based on schema
    const childJSON = this.createChildrenFromSchema(parent.schema.items, parentJSON, childName);

    // Add the child object to the parent object by using the array in jsonPath
    let current = parentJSON;
    for (const key of jsonPath) {
      current = current[key];
    }
    current.push(childJSON);

    try {
      fs.writeFileSync(parent.filePath, JSON.stringify(parentJSON, null, 2), 'utf-8');
      vscode.window.showInformationMessage(`Child object ${childName} created successfully!`);
      this.refresh();
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to create child object: ${errorMessage}`);
    }
  }

  private removeIds(obj: any, parentJSON: any): void {
    for (const key in obj) {
      if (key === '$id') {
        // Remove the $id from the $tags
        if (parentJSON.$tags) {
          parentJSON.$tags = parentJSON.$tags.filter((tag: any) => tag.$id !== obj.$id);
        }
      } else if (typeof obj[key] === 'object') {
        this.removeIds(obj[key], parentJSON);
      }
    }
  }

  async removeItem(item: Item): Promise<void> {
    if (!this.rootPath) {
      vscode.window.showInformationMessage('No folder or workspace opened');
      return;
    }

    //TODOif (item.type === 'array') {
    //TODO  vscode.window.showErrorMessage('Cannot remove array items directly');
    //TODO  return;
    //TODO}

    // Show a quick pick dialog to confirm item removal
    const response = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: `Are you sure you want to remove item ${item.label}?` });
    if (response !== 'Yes') {
      return;
    }

    const parentJSON = JSON.parse(fs.readFileSync(item.filePath, 'utf-8'));

    // Drill down to the desired part of the JSON
    let current = parentJSON;
    for (const key of item.jsonPath) {
      current = current[key];
    }
    // Get the $id of the item and subsequently remove it from the $tags
    this.removeIds(current, parentJSON);


    // Drill down to the desired part of the JSON
    current = parentJSON;
    for (const key of item.jsonPath.slice(0, -1)) {
      current = current[key];
    }

    // First check if current or subobjects

    // Remove the item from the parent JSON
    if (Array.isArray(current)) {
      current.splice(Number(item.jsonPath.slice(-1)[0]), 1);
    } else {
      delete current[item.jsonPath.slice(-1)[0]];
    }

    try {
      fs.writeFileSync(item.filePath, JSON.stringify(parentJSON, null, 2), 'utf-8');
      vscode.window.showInformationMessage(`Item ${item.label} removed successfully!`);
      this.refresh();
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to remove item: ${errorMessage}`);
    }
  }

  async updateItem(item: Item): Promise<void> {
    if (!this.rootPath) {
      vscode.window.showInformationMessage('No folder or workspace opened');
      return;
    }

    const parentJSON = JSON.parse(fs.readFileSync(item.filePath, 'utf-8'));

    const updateItemInJSON = (jsonObject: any, item: Item): void => {
      let current = jsonObject;
      for (let i = 0; i < item.jsonPath.length - 1; i++) {
        const key = item.jsonPath[i];
        if (!current[key]) {
          current[key] = {}; // Initialize if not exist
        }
        current = current[key];
      }

      const lastKey = item.jsonPath[item.jsonPath.length - 1];
      if (item.value !== undefined) {
        current[lastKey] = item.value;
      }

      item.children.forEach((child) => {
        let childCurrent = jsonObject;
        for (let i = 0; i < child.jsonPath.length - 1; i++) {
          const key = child.jsonPath[i];
          if (!childCurrent[key]) {
            childCurrent[key] = {}; // Initialize if not exist
          }
          childCurrent = childCurrent[key];
        }
        const childLastKey = child.jsonPath[child.jsonPath.length - 1];
        if (child.value !== undefined) {
          childCurrent[childLastKey] = child.value;
        }
        if (child.children.length > 0) {
          updateItemInJSON(jsonObject, child);
        }
      });
    };

    updateItemInJSON(parentJSON, item);

    try {
      fs.writeFileSync(item.filePath, JSON.stringify(parentJSON, null, 2), 'utf-8');
      vscode.window.showInformationMessage(`Item ${item.label} updated successfully!`);
      this.refresh();
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to update item: ${errorMessage}`);
    }
  }

}

export class Item extends vscode.TreeItem {
  public children: Item[]; // Add children[] property
  public $tags: any[] = [];
  public value: any;
  public hidden_children: Item[] = [];

  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly schema: any,
    public readonly filePath: string,
    public readonly jsonPath: string[] = [], // New property to track JSON path
    public collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  ) {
    super(label, collapsibleState);
    this.description = "";

    if (this.schema?.contentMediaType) {
      this.iconPath = new vscode.ThemeIcon(this.schema.contentMediaType);
    }
    this.contextValue = this.schema.format;

    this.children = []; // Initialize children[] as an empty array
    this.hidden_children = []; // Initialize hidden_children[] as an empty array
  }

}

function generateUUID(): string {
  return randomUUID();
}