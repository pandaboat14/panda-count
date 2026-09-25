"use client";

import { Component } from "react";

// Renders `fallback` instead of a 3D scene that throws (e.g. no WebGL).
export class SceneBoundary extends Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
