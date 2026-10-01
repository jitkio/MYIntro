import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "highlight.js/styles/atom-one-dark.css";
import "./styles/vendor/bootstrap.min.css";
import "./styles/vendor/github-markdown.min.css";
import "./styles/vendor/fluid.css";
import "./styles/app.css";

createRoot(document.getElementById("root")).render(<App />);
