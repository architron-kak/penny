"use client";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
ModuleRegistry.registerModules([AllCommunityModule]);
export const gridTheme = themeQuartz.withParams({
  backgroundColor: "#ffffff",
  foregroundColor: "#343a34",
  headerBackgroundColor: "#f7f8f5",
  headerTextColor: "#7c8177",
  borderColor: "#eceee6",
  accentColor: "#5b733d",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: 13,
  rowHeight: 61,
  headerHeight: 43,
  wrapperBorderRadius: 14,
  cellHorizontalPadding: 20,
});
