import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

const APP_DIR = path.resolve(__dirname, "../../app");

const ICON_COMPONENTS = new Set([
  "Feather",
  "MaterialCommunityIcons",
  "MaterialIcons",
  "Ionicons",
  "FontAwesome",
  "FontAwesome5",
  "FontAwesome6",
  "AntDesign",
  "Entypo",
  "EvilIcons",
  "Foundation",
  "Octicons",
  "SimpleLineIcons",
  "Zocial",
]);

const PRESSABLE_COMPONENTS = new Set(["Pressable", "TouchableOpacity"]);
const MODAL_TRIGGER_COMPONENTS = new Set(["Pressable", "TouchableOpacity", "Button"]);
const IMAGE_COMPONENTS = new Set(["Image"]);
const LABELED_CONTROL_COMPONENTS = new Set(["Switch", "Slider", "TextInput"]);
const LABELED_SELECTION_COMPONENTS = new Set(["Picker", "SegmentedControl"]);

function listTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsxFiles(p));
    else if (entry.isFile() && p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function getJsxName(node: ts.JsxOpeningLikeElement): string {
  const tn = node.tagName;
  if (ts.isIdentifier(tn)) return tn.text;
  if (ts.isPropertyAccessExpression(tn)) return tn.name.text;
  return "";
}

function isIconName(name: string): boolean {
  if (!name) return false;
  if (ICON_COMPONENTS.has(name)) return true;
  // Local components that look like icons (e.g. ChevronIcon, HazardIcon)
  return /Icon$|Icons$/.test(name) && !PRESSABLE_COMPONENTS.has(name) && !IMAGE_COMPONENTS.has(name);
}

interface AttrInfo {
  names: Set<string>;
  hasSpread: boolean;
  rawValue: Map<string, ts.JsxAttributeValue | undefined>;
}

function getAttrs(node: ts.JsxOpeningLikeElement): AttrInfo {
  const names = new Set<string>();
  let hasSpread = false;
  const rawValue = new Map<string, ts.JsxAttributeValue | undefined>();
  for (const attr of node.attributes.properties) {
    if (ts.isJsxSpreadAttribute(attr)) {
      hasSpread = true;
      continue;
    }
    if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name)) {
      names.add(attr.name.text);
      rawValue.set(attr.name.text, attr.initializer);
    }
  }
  return { names, hasSpread, rawValue };
}

function descendantHas(node: ts.Node, predicate: (jsxName: string) => boolean): boolean {
  let found = false;
  function visit(n: ts.Node) {
    if (found) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const opening = ts.isJsxElement(n) ? n.openingElement : n;
      const name = getJsxName(opening);
      if (predicate(name)) {
        found = true;
        return;
      }
    }
    n.forEachChild(visit);
  }
  visit(node);
  return found;
}

function hasNonWhitespaceText(node: ts.Node): boolean {
  let found = false;
  function visit(n: ts.Node) {
    if (found) return;
    if (ts.isJsxText(n) && n.text.trim().length > 0) {
      found = true;
      return;
    }
    n.forEachChild(visit);
  }
  visit(node);
  return found;
}

function isFalseExpression(init: ts.JsxAttributeValue | undefined): boolean {
  if (!init || !ts.isJsxExpression(init) || !init.expression) return false;
  return init.expression.kind === ts.SyntaxKind.FalseKeyword;
}

function expressionIdentifiers(expression: ts.Expression | undefined): Set<string> {
  const identifiers = new Set<string>();
  if (!expression) return identifiers;
  function visit(node: ts.Node) {
    if (ts.isIdentifier(node)) identifiers.add(node.text);
    node.forEachChild(visit);
  }
  visit(expression);
  return identifiers;
}

function isTruthyStateArgument(argument: ts.Expression | undefined): boolean {
  if (!argument) return false;
  if (
    argument.kind === ts.SyntaxKind.FalseKeyword ||
    argument.kind === ts.SyntaxKind.NullKeyword ||
    argument.kind === ts.SyntaxKind.UndefinedKeyword
  ) {
    return false;
  }
  return true;
}

function containsModalStateOpen(node: ts.Node, modalStateNames: Set<string>): boolean {
  let found = false;
  function visit(current: ts.Node) {
    if (found) return;
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text.startsWith("set") &&
      isTruthyStateArgument(current.arguments[0])
    ) {
      const stateName = current.expression.text.slice(3);
      if (
        modalStateNames.has(stateName) ||
        [...modalStateNames].some((modalStateName) => modalStateName.toLowerCase() === stateName.toLowerCase())
      ) {
        found = true;
        return;
      }
    }
    current.forEachChild(visit);
  }
  visit(node);
  return found;
}

function getLocalFunctionBodies(sourceFile: ts.SourceFile): Map<string, ts.Node> {
  const bodies = new Map<string, ts.Node>();
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      bodies.set(node.name.text, node.body);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
      node.initializer.body
    ) {
      bodies.set(node.name.text, node.initializer.body);
    }
    node.forEachChild(visit);
  }
  visit(sourceFile);
  return bodies;
}

function getLocalModalStateNames(sourceFile: ts.SourceFile): Set<string> {
  const stateNames = new Set<string>();
  const localModalWrapperNames = getLocalModalWrapperNames(sourceFile);
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const name = getJsxName(opening);
      // Local modal wrappers use the explicit *Modal/*Dialog naming convention.
      // Requiring a local declaration avoids treating an imported component as
      // statically knowable, while the visibility prop keeps ordinary dialogs
      // with unrelated props out of the modal trigger heuristic.
      if (name === "Modal" || name === "Dialog" || name === "GameModal" || localModalWrapperNames.has(name)) {
        const attrs = getAttrs(opening);
        for (const prop of ["visible", "open", "isOpen"]) {
          const init = attrs.rawValue.get(prop);
          if (init && ts.isJsxExpression(init) && init.expression) {
            for (const identifier of expressionIdentifiers(init.expression)) {
              stateNames.add(identifier);
            }
          }
        }
      }
    }
    node.forEachChild(visit);
  }
  visit(sourceFile);
  return stateNames;
}

function getLocalModalWrapperNames(sourceFile: ts.SourceFile): Set<string> {
  const localComponents = new Set<string>();

  function visit(node: ts.Node) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name &&
      /(Modal|Dialog)$/.test(node.name.text)
    ) {
      localComponents.add(node.name.text);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /(Modal|Dialog)$/.test(node.name.text) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      localComponents.add(node.name.text);
    }
    node.forEachChild(visit);
  }

  visit(sourceFile);
  return localComponents;
}

function isSelectionComponentName(name: string, localComponents: Set<string>): boolean {
  return LABELED_SELECTION_COMPONENTS.has(name) || localComponents.has(name);
}

function getLocalSelectionComponents(sourceFile: ts.SourceFile): Set<string> {
  const localComponents = new Set<string>();

  function visit(node: ts.Node) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name &&
      /(Dropdown|Select)$/.test(node.name.text)
    ) {
      localComponents.add(node.name.text);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /(Dropdown|Select)$/.test(node.name.text) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      localComponents.add(node.name.text);
    }
    node.forEachChild(visit);
  }

  visit(sourceFile);
  return localComponents;
}

interface Violation {
  file: string;
  line: number;
  message: string;
}

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function scanSource(filePath: string, text: string, relPath: string): Violation[] {
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: Violation[] = [];
  const localSelectionComponents = getLocalSelectionComponents(sourceFile);
  const localModalStateNames = getLocalModalStateNames(sourceFile);
  const localFunctionBodies = getLocalFunctionBodies(sourceFile);

  function visit(node: ts.Node) {
    // <Image .../> checks
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const name = getJsxName(node);
      if (IMAGE_COMPONENTS.has(name)) {
        const attrs = getAttrs(node);
        if (!attrs.hasSpread) {
          const hasLabel = attrs.names.has("accessibilityLabel") || attrs.names.has("aria-label");
          const accessibleFalse = attrs.names.has("accessible") && isFalseExpression(attrs.rawValue.get("accessible"));
          if (!hasLabel && !accessibleFalse) {
            violations.push({
              file: relPath,
              line: lineOf(sourceFile, node.getStart(sourceFile)),
              message: `<Image> must have either accessibilityLabel or accessible={false}`,
            });
          }
        }
      }
    }

    // <Pressable>/<TouchableOpacity> checks (only on full elements, since icon-only buttons must have children)
    if (ts.isJsxElement(node)) {
      const opening = node.openingElement;
      const name = getJsxName(opening);
      if (PRESSABLE_COMPONENTS.has(name)) {
        const attrs = getAttrs(opening);
        const skip =
          attrs.hasSpread ||
          attrs.names.has("accessibilityLabel") ||
          attrs.names.has("aria-label");
        if (!skip) {
          const hasTextChild = descendantHas(node, (n) => n === "Text");
          const hasRawText = hasNonWhitespaceText(node);
          if (!hasTextChild && !hasRawText) {
            const hasIcon = descendantHas(node, isIconName);
            if (hasIcon) {
              violations.push({
                file: relPath,
                line: lineOf(sourceFile, opening.getStart(sourceFile)),
                message: `<${name}> appears to contain only an icon and must have an accessibilityLabel`,
              });
            }
          }
        }
      }
    }

    // <Switch> / <Slider> / <TextInput> need an accessibilityLabel (or aria-label).
    // These controls have no visible text of their own, so screen readers depend on the label.
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const name = getJsxName(node);
      if (LABELED_CONTROL_COMPONENTS.has(name)) {
        const attrs = getAttrs(node);
        if (!attrs.hasSpread) {
          const hasLabel =
            attrs.names.has("accessibilityLabel") ||
            attrs.names.has("aria-label") ||
            attrs.names.has("accessibilityLabelledBy") ||
            attrs.names.has("aria-labelledby");
          if (!hasLabel) {
            violations.push({
              file: relPath,
              line: lineOf(sourceFile, node.getStart(sourceFile)),
              message: `<${name}> must have an accessibilityLabel (or aria-label) for screen-reader support`,
            });
          }
        }
      }
    }

    // Picker, SegmentedControl, and locally-defined *Dropdown/*Select controls
    // have no reliable visible label of their own for screen readers.
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const name = getJsxName(node);
      if (isSelectionComponentName(name, localSelectionComponents)) {
        const attrs = getAttrs(node);
        if (!attrs.hasSpread) {
          const hasLabel =
            attrs.names.has("accessibilityLabel") ||
            attrs.names.has("aria-label") ||
            attrs.names.has("accessibilityLabelledBy") ||
            attrs.names.has("aria-labelledby");
          if (!hasLabel) {
            violations.push({
              file: relPath,
              line: lineOf(sourceFile, node.getStart(sourceFile)),
              message: `<${name}> must have an accessibilityLabel (or aria-label) for screen-reader support`,
            });
          }
        }
      }
    }

    // Self-closing Pressable/TouchableOpacity (no children) — needs a label too if it has no text content at all.
    if (ts.isJsxSelfClosingElement(node)) {
      const name = getJsxName(node);
      if (PRESSABLE_COMPONENTS.has(name)) {
        const attrs = getAttrs(node);
        const skip =
          attrs.hasSpread ||
          attrs.names.has("accessibilityLabel") ||
          attrs.names.has("aria-label") ||
          attrs.names.has("children");
        if (!skip) {
          violations.push({
            file: relPath,
            line: lineOf(sourceFile, node.getStart(sourceFile)),
            message: `<${name} /> with no children must have an accessibilityLabel`,
          });
        }
      }
    }

    // Controls that locally open a Modal/Dialog need an explicit accessible name.
    // This intentionally follows only state setters whose state is used by a
    // local modal-like component. Imported handlers and spread props remain
    // outside the scanner's static certainty boundary.
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const name = getJsxName(opening);
      if (MODAL_TRIGGER_COMPONENTS.has(name)) {
        const attrs = getAttrs(opening);
        if (!attrs.hasSpread && !attrs.names.has("accessibilityLabel") && !attrs.names.has("aria-label")) {
          let opensModal = false;
          for (const handlerName of ["onPress", "onClick", "onActivate"]) {
            const init = attrs.rawValue.get(handlerName);
            if (!init || !ts.isJsxExpression(init) || !init.expression) continue;
            const expression = init.expression;
            if (containsModalStateOpen(expression, localModalStateNames)) {
              opensModal = true;
              break;
            }
            if (ts.isIdentifier(expression)) {
              const body = localFunctionBodies.get(expression.text);
              if (body && containsModalStateOpen(body, localModalStateNames)) {
                opensModal = true;
                break;
              }
            }
          }
          if (opensModal) {
            violations.push({
              file: relPath,
              line: lineOf(sourceFile, opening.getStart(sourceFile)),
              message: `<${name}> opens a modal or dialog and must have an accessibilityLabel (or aria-label)`,
            });
          }
        }
      }
    }

    node.forEachChild(visit);
  }

  visit(sourceFile);
  return violations;
}

function scanFile(filePath: string): Violation[] {
  const text = fs.readFileSync(filePath, "utf8");
  const relPath = path.relative(path.resolve(APP_DIR, "../.."), filePath);
  return scanSource(filePath, text, relPath);
}

describe("icon-only button accessibility heuristic (self-test)", () => {
  function scan(src: string): Violation[] {
    return scanSource("/virtual.tsx", src, "virtual.tsx");
  }

  it("flags an icon-only Pressable missing accessibilityLabel", () => {
    const v = scan(`<Pressable onPress={f}><Feather name="x" size={16} /></Pressable>`);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/accessibilityLabel/);
  });

  it("flags an icon-only TouchableOpacity missing accessibilityLabel", () => {
    const v = scan(`<TouchableOpacity onPress={f}><MaterialCommunityIcons name="x" size={16} /></TouchableOpacity>`);
    expect(v).toHaveLength(1);
  });

  it("accepts an icon-only Pressable that has accessibilityLabel", () => {
    const v = scan(`<Pressable accessibilityLabel="Close"><Feather name="x" size={16} /></Pressable>`);
    expect(v).toEqual([]);
  });

  it("accepts a Pressable that contains a <Text> child", () => {
    const v = scan(`<Pressable onPress={f}><Feather name="x" /><Text>Close</Text></Pressable>`);
    expect(v).toEqual([]);
  });

  it("accepts a Pressable with raw text content", () => {
    const v = scan(`<Pressable onPress={f}>Hello</Pressable>`);
    expect(v).toEqual([]);
  });

  it("ignores Pressables with spread props (cannot determine statically)", () => {
    const v = scan(`<Pressable {...rest}><Feather name="x" /></Pressable>`);
    expect(v).toEqual([]);
  });

  it("flags an <Image> with no accessibility info", () => {
    const v = scan(`<Image source={s} />`);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/Image/);
  });

  it("accepts <Image accessible={false} />", () => {
    const v = scan(`<Image source={s} accessible={false} />`);
    expect(v).toEqual([]);
  });

  it("accepts <Image accessibilityLabel='alt' />", () => {
    const v = scan(`<Image source={s} accessibilityLabel="alt" />`);
    expect(v).toEqual([]);
  });

  it("recognizes locally-named icon components (e.g. *Icon)", () => {
    const v = scan(`<Pressable onPress={f}><HazardIcon /></Pressable>`);
    expect(v).toHaveLength(1);
  });

  it("flags a <Switch> missing accessibilityLabel", () => {
    const v = scan(`<Switch value={on} onValueChange={f} />`);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/Switch/);
  });

  it("accepts a <Switch> with accessibilityLabel", () => {
    const v = scan(`<Switch value={on} onValueChange={f} accessibilityLabel="Toggle music" />`);
    expect(v).toEqual([]);
  });

  it("flags a <Slider> missing accessibilityLabel", () => {
    const v = scan(`<Slider value={x} onValueChange={f} minimumValue={0} maximumValue={100} />`);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/Slider/);
  });

  it("accepts a <Slider> with accessibilityLabel", () => {
    const v = scan(`<Slider value={x} onValueChange={f} accessibilityLabel="Volume" />`);
    expect(v).toEqual([]);
  });

  it("flags a <TextInput> missing accessibilityLabel", () => {
    const v = scan(`<TextInput value={s} onChangeText={f} placeholder="Name" />`);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/TextInput/);
  });

  it("accepts a <TextInput> with accessibilityLabel", () => {
    const v = scan(`<TextInput value={s} onChangeText={f} accessibilityLabel="Commander name" />`);
    expect(v).toEqual([]);
  });

  it("accepts a <TextInput> with aria-label", () => {
    const v = scan(`<TextInput value={s} onChangeText={f} aria-label="Commander name" />`);
    expect(v).toEqual([]);
  });

  it("ignores <Switch> with spread props (cannot determine statically)", () => {
    const v = scan(`<Switch {...rest} />`);
    expect(v).toEqual([]);
  });

  it("ignores <TextInput> with spread props (cannot determine statically)", () => {
    const v = scan(`<TextInput {...rest} value={s} />`);
    expect(v).toEqual([]);
  });

  it("flags a <Picker> missing accessibilityLabel", () => {
    const v = scan(`<Picker selectedValue={value} onValueChange={f} />`);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/Picker/);
  });

  it("accepts a <Picker> with aria-label", () => {
    const v = scan(`<Picker selectedValue={value} onValueChange={f} aria-label="Choose sector" />`);
    expect(v).toEqual([]);
  });

  it("ignores a <Picker> with spread props (cannot determine statically)", () => {
    const v = scan(`<Picker {...rest} selectedValue={value} />`);
    expect(v).toEqual([]);
  });

  it("flags a <SegmentedControl> missing accessibilityLabel", () => {
    const v = scan(`<SegmentedControl values={values} selectedIndex={index} onChange={f} />`);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/SegmentedControl/);
  });

  it("accepts a <SegmentedControl> with accessibilityLabel", () => {
    const v = scan(
      `<SegmentedControl values={values} selectedIndex={index} onChange={f} accessibilityLabel="View mode" />`,
    );
    expect(v).toEqual([]);
  });

  it("flags a locally-defined Dropdown missing accessibilityLabel", () => {
    const v = scan(`
      function SectorDropdown() { return <View />; }
      <SectorDropdown value={value} onChange={f} />
    `);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/SectorDropdown/);
  });

  it("accepts a locally-defined Dropdown with accessibilityLabel", () => {
    const v = scan(`
      const SectorDropdown = () => <View />;
      <SectorDropdown value={value} onChange={f} accessibilityLabel="Sector" />
    `);
    expect(v).toEqual([]);
  });

  it("flags a locally-defined Select missing accessibilityLabel", () => {
    const v = scan(`
      const FactionSelect = function() { return <View />; };
      <FactionSelect value={value} onChange={f} />
    `);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/FactionSelect/);
  });

  it("accepts a locally-defined Select with aria-label", () => {
    const v = scan(`
      function FactionSelect() { return <View />; }
      <FactionSelect value={value} onChange={f} aria-label="Faction" />
    `);
    expect(v).toEqual([]);
  });

  it("does not flag an imported-looking Dropdown without a local definition", () => {
    const v = scan(`<ExternalDropdown value={value} onChange={f} />`);
    expect(v).toEqual([]);
  });

  it("ignores locally-defined Dropdown usage with spread props", () => {
    const v = scan(`
      function SectorDropdown() { return <View />; }
      <SectorDropdown {...rest} value={value} />
    `);
    expect(v).toEqual([]);
  });
});

describe("modal trigger accessibility heuristic (self-test)", () => {
  function scan(src: string): Violation[] {
    return scanSource("/virtual.tsx", src, "virtual.tsx");
  }

  it("flags a locally-scoped modal trigger without an accessible label", () => {
    const v = scan(`
      const [showDetails, setShowDetails] = useState(false);
      <Pressable onPress={() => setShowDetails(true)}><Text>Details</Text></Pressable>
      <Modal visible={showDetails} />
    `);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/opens a modal/);
  });

  it("accepts a labeled local modal trigger", () => {
    const v = scan(`
      const [showDetails, setShowDetails] = useState(false);
      <Pressable accessibilityLabel="Open details" onPress={() => setShowDetails(true)}><Text>Details</Text></Pressable>
      <Modal visible={showDetails} />
    `);
    expect(v).toEqual([]);
  });

  it("accepts a spread-prop modal trigger when its label cannot be determined statically", () => {
    const v = scan(`
      const [showDetails, setShowDetails] = useState(false);
      <Pressable {...triggerProps} onPress={() => setShowDetails(true)}><Text>Details</Text></Pressable>
      <Modal visible={showDetails} />
    `);
    expect(v).toEqual([]);
  });

  it("follows a locally-defined handler that opens a dialog", () => {
    const v = scan(`
      const [dialogOpen, setDialogOpen] = useState(false);
      function openDialog() { setDialogOpen(true); }
      <Button onPress={openDialog} title="Open" />
      <Dialog open={dialogOpen} />
    `);
    expect(v).toHaveLength(1);
  });

  it("flags an unlabeled trigger for a locally-defined modal wrapper", () => {
    const v = scan(`
      const [showDetails, setShowDetails] = useState(false);
      function DetailsModal({ visible }: { visible: boolean }) {
        return <Modal visible={visible} />;
      }
      <Pressable onPress={() => setShowDetails(true)}><Text>Details</Text></Pressable>
      <DetailsModal visible={showDetails} />
    `);
    expect(v).toHaveLength(1);
    expect(v[0].message).toMatch(/opens a modal/);
  });

  it("accepts a spread-prop trigger for a locally-defined modal wrapper", () => {
    const v = scan(`
      const [showDetails, setShowDetails] = useState(false);
      function DetailsModal({ visible }: { visible: boolean }) {
        return <Modal visible={visible} />;
      }
      <Pressable {...triggerProps} onPress={() => setShowDetails(true)}><Text>Details</Text></Pressable>
      <DetailsModal visible={showDetails} />
    `);
    expect(v).toEqual([]);
  });
});

describe("icon-only button accessibility (artifacts/megacity/app)", () => {
  const files = listTsxFiles(APP_DIR);

  it("walks at least one app file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("flags no unlabeled icon-only controls, images, or local modal triggers", () => {
    const violations: Violation[] = [];
    for (const file of files) {
      violations.push(...scanFile(file));
    }
    if (violations.length > 0) {
      const formatted = violations
        .map((v) => `  ${v.file}:${v.line} — ${v.message}`)
        .join("\n");
      throw new Error(
        `Found ${violations.length} accessibility violation(s) in artifacts/megacity/app:\n${formatted}\n\n` +
          `Fix by adding an accessibilityLabel="..." to the button, wrapping decorative <Image> elements with accessible={false}, ` +
          `or adding a <Text> child to make the control self-describing.`,
      );
    }
  });
});
