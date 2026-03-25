export interface TextItem {
  id: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  isBold: boolean;
  isItalic: boolean;
  color: string;
  pageIndex: number;
  originalContent: string;
}
