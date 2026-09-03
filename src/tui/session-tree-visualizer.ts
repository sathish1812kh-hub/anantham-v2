/**
 * Session Branch Tree Visualization & Interactive Switcher
 * PRD-TUI-003: Session Branch Tree Visualization & Interactive Switcher
 */

export interface SessionBranchNode {
  id: string;
  name: string;
  parentBranchId?: string;
  createdAt: string;
  messageCount: number;
}

export class SessionTreeVisualizer {
  public renderTree(branches: SessionBranchNode[], activeBranchId: string): string {
    if (branches.length === 0) {
      return "No session branches found.";
    }

    const rootNodes = branches.filter((b) => !b.parentBranchId);
    const childMap = new Map<string, SessionBranchNode[]>();

    for (const b of branches) {
      if (b.parentBranchId) {
        if (!childMap.has(b.parentBranchId)) {
          childMap.set(b.parentBranchId, []);
        }
        childMap.get(b.parentBranchId)!.push(b);
      }
    }

    const lines: string[] = ["Session Branch Hierarchy:"];

    const traverse = (node: SessionBranchNode, prefix: string, isLast: boolean) => {
      const marker = node.id === activeBranchId ? "* (active)" : "";
      const connector = isLast ? "└── " : "├── ";
      lines.push(`${prefix}${connector}${node.name} [${node.id}] (${node.messageCount} msgs) ${marker}`);

      const children = childMap.get(node.id) ?? [];
      const newPrefix = prefix + (isLast ? "    " : "│   ");

      children.forEach((child, idx) => {
        traverse(child, newPrefix, idx === children.length - 1);
      });
    };

    rootNodes.forEach((root, idx) => {
      traverse(root, "", idx === rootNodes.length - 1);
    });

    return lines.join("\n");
  }

  public switchBranch(branches: SessionBranchNode[], targetNameOrId: string): SessionBranchNode | null {
    const match = branches.find(
      (b) => b.id.toLowerCase() === targetNameOrId.toLowerCase() || b.name.toLowerCase() === targetNameOrId.toLowerCase()
    );
    return match ?? null;
  }
}
