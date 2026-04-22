import { createElement } from "react";
import { createBrowserRouter, Navigate, redirect } from "react-router";
import { Root } from "./Root";
import { Home } from "./pages/Home";
import { Editor } from "./pages/Editor";
import { Auth } from "./pages/Auth";
import { Community } from "./pages/Community";
import { PostDetail } from "./pages/PostDetail";
import { Profile } from "./pages/Profile";
import { Repository } from "./pages/Repository";
import { StylePreview } from "./pages/StylePreview";
import { PluginDeveloperCenter } from "./pages/PluginDeveloperCenter";
import { COMMUNITY_FEATURE_ENABLED } from "./config/runtimeMode";

async function isAuthenticated() {
  const token = localStorage.getItem("auth_token");
  if (!token) return false;
  try {
    const response = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error("Unauthorized");
    }
    const data = await response.json();
    if (data?.user) {
      localStorage.setItem("auth_user", JSON.stringify(data.user));
    }
    return true;
  } catch (_error) {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    return false;
  }
}

async function requireAuthLoader() {
  const authed = await isAuthenticated();
  if (!authed) {
    throw redirect("/login");
  }
  return null;
}

async function redirectIfAuthedLoader() {
  const authed = await isAuthenticated();
  if (authed) {
    throw redirect("/home");
  }
  return null;
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, element: createElement(Navigate, { to: "/login", replace: true }) },
      { path: "home", Component: Home, loader: requireAuthLoader },
      { path: "editor", Component: Editor, loader: requireAuthLoader },
      { path: "login", Component: Auth, loader: redirectIfAuthedLoader },
      { path: "register", Component: Auth, loader: redirectIfAuthedLoader },
      { path: "forgot-password", Component: Auth, loader: redirectIfAuthedLoader },
      ...(COMMUNITY_FEATURE_ENABLED
        ? [
            { path: "community", Component: Community, loader: requireAuthLoader },
            { path: "community/post/:id", Component: PostDetail, loader: requireAuthLoader },
            { path: "community/plugin-developer-center", Component: PluginDeveloperCenter, loader: requireAuthLoader },
          ]
        : [
            { path: "community", element: createElement(Navigate, { to: "/home", replace: true }) },
            { path: "community/*", element: createElement(Navigate, { to: "/home", replace: true }) },
          ]),
      { path: "profile", Component: Profile, loader: requireAuthLoader },
      { path: "repository", Component: Repository, loader: requireAuthLoader },
      { path: "style-preview/:previewId", Component: StylePreview, loader: requireAuthLoader },
      { path: "auth", element: createElement(Navigate, { to: "/login", replace: true }) },
    ],
  },
]);