import React, { useState } from "react";
import { api } from "./api/client";
import { DashboardShell } from "./components/DashboardShell";
import { LandingPage } from "./components/LandingPage";
import { UploadPage } from "./components/UploadPage";
import type { Project } from "./types/api";

type Screen = "landing" | "upload" | "dashboard";

export function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const handleTryDemo = async () => {
    setIsLoadingDemo(true);
    setDemoError(null);
    try {
      const proj = await api.createDemoProject();
      setActiveProject(proj);
      setScreen("dashboard");
    } catch (err) {
      setDemoError(
        err instanceof Error ? err.message : "Unable to connect to analysis backend."
      );
    } finally {
      setIsLoadingDemo(false);
    }
  };

  return (
    <>
      {demoError && (
        <div className="fixed bottom-4 right-4 z-50 max-w-md p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/40 text-xs text-rose-200 shadow-2xl flex items-center justify-between gap-3">
          <span>{demoError}</span>
          <button
            onClick={() => setDemoError(null)}
            className="text-rose-300 hover:text-white font-mono"
          >
            ✕
          </button>
        </div>
      )}

      {screen === "landing" && (
        <LandingPage
          onExploreClick={() => setScreen("upload")}
          onTryDemo={handleTryDemo}
          isLoadingDemo={isLoadingDemo}
        />
      )}

      {screen === "upload" && (
        <UploadPage
          onBack={() => setScreen("landing")}
          onProjectReady={(proj) => {
            setActiveProject(proj);
            setScreen("dashboard");
          }}
          onTryDemo={handleTryDemo}
          isLoadingDemo={isLoadingDemo}
        />
      )}

      {screen === "dashboard" && activeProject && (
        <DashboardShell
          project={activeProject}
          onGoHome={() => setScreen("landing")}
          onGoUpload={() => setScreen("upload")}
        />
      )}
    </>
  );
}

export default App;
