"use client";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
ModuleRegistry.registerModules([AllCommunityModule]);
export const gridTheme = themeQuartz.withParams({
  backgroundColor: "#ffffff",
  foregroundColor: "#182521",
  headerBackgroundColor: "#f7f9f8",
  headerTextColor: "#56675f",
  borderColor: "#e7ece9",
  accentColor: "#167653",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontSize: 13,
  rowHeight: 61,
  headerHeight: 43,
  wrapperBorderRadius: 14,
  cellHorizontalPadding: 20,
});
