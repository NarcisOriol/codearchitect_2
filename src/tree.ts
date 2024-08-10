import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export class ItemTreeProvider implements vscode.TreeDataProvider<Item> {

  private _onDidChangeTreeData: vscode.EventEmitter<Item | undefined | void> = new vscode.EventEmitter<Item | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<Item | undefined | void> = this._onDidChangeTreeData.event;

  constructor(private rootPath: string, private schema: any) {
    console.log(schema)
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Item): vscode.TreeItem {
    return element;
  }

  // New method to get children from JSON
  private getChildrenFromJson(jsonObject: any, filePath: string, jsonPath: string[], schema: any): Item[] {
    if (Array.isArray(jsonObject)) {
      // Handle array elements
      return jsonObject.map((value, index) => new Item(
        value.name,
        Array.isArray(value) || typeof value === 'object'
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        value.name,
        schema,
        filePath,
        [...jsonPath, index.toString()] // Include array index in path
      ));
    } else {
      const readOnlyKeys = Object.keys(schema.properties).filter((key) => schema.properties[key].readOnly === true);
      // Handle object properties
      return Object.keys(jsonObject).filter(key => !readOnlyKeys.includes(key)).map(key => new Item(
        key,
        Array.isArray(jsonObject[key]) || typeof jsonObject[key] === 'object'
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
        schema.properties?.[key]?.title || key,
        schema.properties?.[key],
        filePath,
        [...jsonPath, key] // Include property key in path
      ));
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
        vscode.TreeItemCollapsibleState.Collapsed,
        this.schema.title,
        this.schema,
        path.join(this.rootPath, file), // Pass the parent JSON file path
        []  // Root path
      ));

      // Attach children to each parent item
      ParentItems.forEach(parent => {
        const parentJSON = JSON.parse(fs.readFileSync(parent.filePath, 'utf-8')); // Read the parent JSON file
        const children = this.getChildrenFromJson(parentJSON, parent.filePath, parent.jsonPath, parent.schema);
        parent.children = children;
      });

      return ParentItems;
    } else {
      // Get the parent item's JSON file
      const parentJSON = JSON.parse(fs.readFileSync(element.filePath, 'utf-8')); // Read the parent JSON file
  
      // Drill down to the desired part of the JSON
      const jsonObject = element.jsonPath.reduce((obj, key) => obj[key], parentJSON);
  
      // Get the children of the parent item
      const children = this.getChildrenFromJson(jsonObject, element.filePath, element.jsonPath, element.schema);
      element.children = children;
      return children;
    }
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
    const parentJSON: { [key: string]: any } = {};

    // Create all the properties
    for (const key in this.schema.properties) {
      if (key === 'name') {
        // Create the name
        parentJSON.name = name;
        continue;
      } else if (key === '$id') {
        // Create a unique identifier for the parent object and save key as $id
        parentJSON.$id = generateUUID();
        continue;
      }
      const type = this.schema.properties[key].type;
      if (type === 'string') {
        parentJSON[key] = '';
      } else if (type === 'number') {
        parentJSON[key] = 0;
      } else if (type === 'boolean') {
        parentJSON[key] = false;
      } else if (type === 'array') {
        parentJSON[key] = [];
      } else {
        // Show a warning message if the type is not supported
        vscode.window.showWarningMessage(`Type ${type} in property ${key} is not supported`);
      }
    }

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

    if (parent.type !== 'array') {
      vscode.window.showErrorMessage('Child object can only be created for type array');
      return;
    }

    if(!parent.schema.items) {
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

    const childJSON: { [key: string]: any } = {};

    for (const key in parent.schema.properties) {
      if (key === 'name') {
        childJSON.name = childName;
        continue;
      } else if (key === '$id') {
        childJSON.$id = generateUUID();
        continue;
      }
      const type = parent.schema.properties[key].type;
      if (type === 'string') {
        childJSON[key] = '';
      } else if (type === 'number') {
        childJSON[key] = 0;
      } else if (type === 'boolean') {
        childJSON[key] = false;
      } else if (type === 'array') {
        childJSON[key] = [];
      } else {
        vscode.window.showWarningMessage(`Type ${type} in property ${key} is not supported`);
      }
    }

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
}

export class Item extends vscode.TreeItem {
  public children: Item[]; // Add children[] property
  public type: string;

  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly description: string,
    public readonly schema: any,
    public readonly filePath: string,
    public readonly jsonPath: string[] = [] // New property to track JSON path
  ) {
    super(label, collapsibleState);
    this.description = "";

    //this.tooltip = `${this.label}-${this.description}`;

    if (this.schema) {
      this.type = this.schema.type;
      if (this.type === 'array') {
        const items = this.schema.items;
        //Check if $ref exists in the items
        if (items.$ref) {
          const config = vscode.workspace.getConfiguration('codearchitect');
          const pathFileProfile = config.get<string>('pathFileProfile', '');
          //Extract the path from the pathFileProfile
          const refPath = path.join(path.dirname(pathFileProfile), items.$ref);
          const refSchema = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
          this.schema = refSchema;
        }
      }
    } else {
      this.type = 'object';
    }

    this.iconPath = new vscode.ThemeIcon('symbol-' + this.type);

    this.contextValue = 'item-' + this.type;

    this.children = []; // Initialize children[] as an empty array
  }
}
function generateUUID(): string {
  return randomUUID();
}