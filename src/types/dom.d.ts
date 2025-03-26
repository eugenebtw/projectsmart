interface HTMLElement {
    dragOverHandler?: (event: DragEvent) => void;
    dropHandler?: (event: DragEvent) => void;
    dragLeaveHandler?: (event: DragEvent) => void;
    dragEndHandler?: (event: DragEvent) => void;
  }

  interface Document {
    dragEndHandler?: (event: DragEvent) => void;
  }