import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.querySelector("#root") as HTMLElement).render(<App />);
