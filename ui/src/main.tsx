import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import "./index.css";
import { Landing } from "./routes/Landing";
import { Seojae } from "./routes/Seojae";
import { Sarangchae } from "./routes/Sarangchae";

const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/seojae", element: <Seojae /> },
  { path: "/sarangchae", element: <Sarangchae /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
