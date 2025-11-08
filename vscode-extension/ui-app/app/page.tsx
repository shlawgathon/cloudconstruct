"use client";

import { useEffect } from "react";
import { LogIn, UserPlus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

declare global {
  interface Window {
    vscode?: {
      postMessage: (message: { command: string; [key: string]: unknown }) => void;
    };
  }
}

export default function LoginPage() {
  useEffect(() => {
    // Acquire vscode API if available
    if (typeof window !== "undefined" && !window.vscode) {
      try {
        window.vscode = (window as any).acquireVsCodeApi?.() || undefined;
      } catch (e) {
        // vscode API not available (e.g., running standalone)
        console.log("VS Code API not available");
      }
    }

    // Listen for messages from parent window (VS Code extension)
    const handleMessage = (event: MessageEvent) => {
      // Handle messages from VS Code extension if needed
      console.log("Received message:", event.data);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleLogin = () => {
    if (window.vscode) {
      window.vscode.postMessage({ command: "login" });
    } else {
      // Fallback for standalone mode
      console.log("Login clicked");
    }
  };

  const handleSignUp = () => {
    if (window.vscode) {
      window.vscode.postMessage({ command: "signup" });
    } else {
      // Fallback for standalone mode
      console.log("Sign Up clicked");
    }
  };

  const handleOpenBrowser = () => {
    if (window.vscode) {
      window.vscode.postMessage({ command: "openBrowser" });
    } else {
      // Fallback for standalone mode
      window.open("https://cloudconstruct.io", "_blank");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md border-border/50 shadow-sm">
        <CardHeader className="text-center space-y-3 pb-6">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Draw your database to life
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            AI-powered infrastructure prototyping with visual feedback
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleLogin} className="w-full" size="lg">
            <LogIn className="mr-2 h-4 w-4" />
            Login
          </Button>
          <Button onClick={handleSignUp} variant="secondary" className="w-full" size="lg">
            <UserPlus className="mr-2 h-4 w-4" />
            Sign Up
          </Button>
          <Button onClick={handleOpenBrowser} variant="outline" className="w-full" size="lg">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open in Browser
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

