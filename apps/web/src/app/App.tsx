import { Navigate, Route, Routes } from "react-router-dom";

import { PlayPage } from "../pages/PlayPage.tsx";
import { SessionsPage } from "../pages/SessionsPage.tsx";
import { StoriesPage } from "../pages/StoriesPage.tsx";
import { StoryDetailPage } from "../pages/StoryDetailPage.tsx";
import { AppProviders } from "./providers/AppProviders.tsx";

/**
 * Root application routes.
 */
export function App() {
  return (
    <AppProviders>
      <Routes>
        <Route path="/" element={<StoriesPage />} />
        <Route path="/stories/:templateId" element={<StoryDetailPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/play/:sessionId" element={<PlayPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppProviders>
  );
}
