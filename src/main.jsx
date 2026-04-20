import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SpatialAnalyzer from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SpatialAnalyzer />
  </StrictMode>
);
