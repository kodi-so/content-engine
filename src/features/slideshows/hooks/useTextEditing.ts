import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { TextElement } from "../types";
import { DEFAULT_CONFIG } from "../styles";

// Generate unique ID for new text elements
function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Pending edit for an element
interface PendingEdit {
  text: string;
  fontSize: number;
}

// Pending position for an element
interface PendingPosition {
  x: number;
  y: number;
}

export function useTextEditing() {
  // Currently selected element for editing
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // All local changes (not yet saved to DB)
  const [pendingEdits, setPendingEdits] = useState<Map<string, PendingEdit>>(new Map());
  const [pendingPositions, setPendingPositions] = useState<Map<string, PendingPosition>>(new Map());
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [pendingAdds, setPendingAdds] = useState<TextElement[]>([]);

  const updateTextElement = useMutation(api.content.updateTextElement);
  const deleteTextElement = useMutation(api.content.deleteTextElement);
  const addTextElementMutation = useMutation(api.content.addTextElement);

  // Get the current edited values for an element (pending or original)
  const getEditedValues = (element: TextElement): { text: string; fontSize: number } => {
    const pending = pendingEdits.get(element.id);
    if (pending) {
      return pending;
    }
    return { text: element.content, fontSize: element.fontSize };
  };

  // Get the current position for an element (pending or original)
  const getPosition = (element: TextElement): { x: number; y: number } => {
    const pending = pendingPositions.get(element.id);
    if (pending) {
      return pending;
    }
    return element.position;
  };

  // Start editing a specific element
  const startEditing = (element: TextElement) => {
    setSelectedElementId(element.id);
    // Initialize pending edit if not already exists
    if (!pendingEdits.has(element.id)) {
      setPendingEdits((prev) => {
        const next = new Map(prev);
        next.set(element.id, { text: element.content, fontSize: element.fontSize });
        return next;
      });
    }
  };

  // Update text for currently selected element
  const setEditedText = (text: string) => {
    if (!selectedElementId) return;
    setPendingEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(selectedElementId) || { text: "", fontSize: 48 };
      next.set(selectedElementId, { ...current, text });
      return next;
    });
  };

  // Update font size for currently selected element
  const setEditedFontSize = (fontSize: number) => {
    if (!selectedElementId) return;
    setPendingEdits((prev) => {
      const next = new Map(prev);
      const current = next.get(selectedElementId) || { text: "", fontSize: 48 };
      next.set(selectedElementId, { ...current, fontSize });
      return next;
    });
  };

  // Update position for an element (and select it)
  const updatePosition = (elementId: string, position: { x: number; y: number }, element: TextElement) => {
    // Clamp position to valid range (0-100)
    const clampedPosition = {
      x: Math.max(0, Math.min(100, position.x)),
      y: Math.max(0, Math.min(100, position.y)),
    };

    setPendingPositions((prev) => {
      const next = new Map(prev);
      next.set(elementId, clampedPosition);
      return next;
    });

    // Select this element if not already selected
    if (selectedElementId !== elementId) {
      startEditing(element);
    }
  };

  // Mark element for deletion locally
  const markForDeletion = (elementId: string, allElements: TextElement[] | undefined) => {
    setPendingDeletes((prev) => new Set(prev).add(elementId));

    // Find next element to edit (excluding pending deletes)
    const remainingElements = allElements?.filter(
      (el) => el.id !== elementId && !pendingDeletes.has(el.id)
    );

    // Also check pending adds
    const remainingAdds = pendingAdds.filter(
      (el) => el.id !== elementId
    );

    const allRemaining = [...(remainingElements || []), ...remainingAdds];

    if (allRemaining.length > 0) {
      startEditing(allRemaining[0]);
    } else {
      // No elements left, exit edit mode
      setSelectedElementId(null);
    }
  };

  // Add a new element locally (not saved to DB yet)
  const addTextElement = (_allElements?: TextElement[] | undefined) => {
    const newElement: TextElement = {
      id: generateId(),
      content: "New text",
      position: { x: 50, y: 70 }, // Position lower to avoid overlap
      fontSize: DEFAULT_CONFIG.fontSize,
    };

    setPendingAdds((prev) => [...prev, newElement]);
    setPendingEdits((prev) => {
      const next = new Map(prev);
      next.set(newElement.id, { text: newElement.content, fontSize: newElement.fontSize });
      return next;
    });

    // Start editing the new element
    setSelectedElementId(newElement.id);
  };

  // Cancel all pending changes
  const cancelEditing = () => {
    setPendingEdits(new Map());
    setPendingPositions(new Map());
    setPendingDeletes(new Set());
    setPendingAdds([]);
    setSelectedElementId(null);
  };

  // Save all pending changes to DB
  const saveChanges = async (
    contentId: Id<"content">,
    slideIndex: number,
    originalElements: TextElement[] | undefined
  ) => {
    try {
      // 1. Add new elements
      for (const newElement of pendingAdds) {
        if (!pendingDeletes.has(newElement.id)) {
          const edit = pendingEdits.get(newElement.id);
          const position = pendingPositions.get(newElement.id);
          await addTextElementMutation({
            id: contentId,
            slideIndex,
            element: {
              ...newElement,
              content: edit?.text || newElement.content,
              fontSize: edit?.fontSize || newElement.fontSize,
              position: position || newElement.position,
            },
          });
        }
      }

      // 2. Update existing elements that have edits or position changes
      const elementsToUpdate = new Set([
        ...pendingEdits.keys(),
        ...pendingPositions.keys(),
      ]);

      for (const elementId of elementsToUpdate) {
        // Skip if it's a new element (already handled above) or pending delete
        const isNewElement = pendingAdds.some((el) => el.id === elementId);
        if (isNewElement || pendingDeletes.has(elementId)) continue;

        // Check if element exists in original
        const originalElement = originalElements?.find((el) => el.id === elementId);
        if (originalElement) {
          const edit = pendingEdits.get(elementId);
          const position = pendingPositions.get(elementId);

          const updates: { content?: string; fontSize?: number; position?: { x: number; y: number } } = {};
          if (edit) {
            updates.content = edit.text;
            updates.fontSize = edit.fontSize;
          }
          if (position) {
            updates.position = position;
          }

          if (Object.keys(updates).length > 0) {
            await updateTextElement({
              id: contentId,
              slideIndex,
              elementId,
              updates,
            });
          }
        }
      }

      // 3. Delete elements marked for deletion (only existing ones, not new ones)
      for (const deleteId of pendingDeletes) {
        const isNewElement = pendingAdds.some((el) => el.id === deleteId);
        if (!isNewElement) {
          await deleteTextElement({
            id: contentId,
            slideIndex,
            elementId: deleteId,
          });
        }
      }

      // Clear all pending state
      setPendingEdits(new Map());
      setPendingPositions(new Map());
      setPendingDeletes(new Set());
      setPendingAdds([]);
      setSelectedElementId(null);
    } catch (error) {
      console.error("Failed to save changes:", error);
      alert("Failed to save changes");
    }
  };

  // Enter edit mode by editing the first element, or create one if none exist
  const enterEditModeWithElement = (textElements: TextElement[] | undefined) => {
    // Combine original elements (excluding pending deletes) with pending adds
    const availableOriginal = textElements?.filter((el) => !pendingDeletes.has(el.id)) || [];
    const allAvailable = [...availableOriginal, ...pendingAdds];

    if (allAvailable.length > 0) {
      startEditing(allAvailable[0]);
    } else {
      // No elements exist, create one
      addTextElement(textElements);
    }
  };

  const incrementFontSize = () => {
    if (!selectedElementId) return;
    const current = pendingEdits.get(selectedElementId);
    if (current) {
      setEditedFontSize(Math.min(120, current.fontSize + 4));
    }
  };

  const decrementFontSize = () => {
    if (!selectedElementId) return;
    const current = pendingEdits.get(selectedElementId);
    if (current) {
      setEditedFontSize(Math.max(16, current.fontSize - 4));
    }
  };

  // Get current edited text/fontSize for display
  const editedText = selectedElementId ? pendingEdits.get(selectedElementId)?.text || "" : "";
  const editedFontSize = selectedElementId ? pendingEdits.get(selectedElementId)?.fontSize || 48 : 48;

  // Derived state
  const isEditMode = selectedElementId !== null;

  return {
    isEditMode,
    selectedElementId,
    editedText,
    editedFontSize,
    pendingDeletes,
    pendingAdds,
    pendingEdits,
    pendingPositions,
    setEditedText,
    startEditing,
    cancelEditing,
    saveChanges,
    markForDeletion,
    addTextElement,
    enterEditModeWithElement,
    incrementFontSize,
    decrementFontSize,
    getEditedValues,
    getPosition,
    updatePosition,
  };
}
