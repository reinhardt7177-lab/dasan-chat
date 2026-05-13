import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";

import "./index.css";
import { Intro } from "./routes/Intro";
import { Landing } from "./routes/Landing";
import { RootLayout } from "./routes/RootLayout";
import { Seojae } from "./routes/Seojae";
import { Sarangchae } from "./routes/Sarangchae";

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <Intro /> },
      { path: "/landing", element: <Landing /> },
      { path: "/seojae", element: <Seojae /> },
      { path: "/sarangchae", element: <Sarangchae /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
