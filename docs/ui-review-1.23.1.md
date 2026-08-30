# 1.23.1 UI review scope

This patch is intentionally visual and navigational only. It does not alter SimConnect polling, recorder logic, route computation, GSX integration, flight journey state, or briefing-readiness evaluation.

Validated changes:
- unique Home module labels
- restrained cockpit icon palette and larger tile icons
- removal of injected cross-module quick navigation
- PLAN TAXI limited to Taxi workspace
- Taxi map hidden until a route/guidance context exists
- Guided Briefing hierarchy simplified
- News removed from visible Home/module navigation while the existing internal implementation remains untouched
