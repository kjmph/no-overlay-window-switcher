import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class NoOverlayWindowSwitcher extends Extension {
    enable() {
        try {
            this._settings = this.getSettings('org.gnome.shell.extensions.no-overlay-window-switcher');

            this._activeOrder = new Map(); // Map<workspace_id, Map<wm_class, Map<window_id, order_number>>>
            this._shadowOrder = new Map(); // Map<workspace_id, Map<wm_class, Map<window_id, order_number>>>
            this._nextOrder = 0;
            this._isSwitching = 0;

            // Workspace switch listener
            this._workspaceSwitchedId = global.workspace_manager.connect('workspace-switched', () => {
                const workspace = global.workspace_manager.get_active_workspace();

                if (!this._activeOrder.has(workspace)) {
                    this._activeOrder.set(workspace, new Map());
                    this._shadowOrder.set(workspace, new Map());
                }

                this._cleanupWorkspace(workspace);
            });

            // Window focus listener
            this._windowFocusedId = global.display.connect('notify::focus-window', () => {
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                    const workspace = global.workspace_manager.get_active_workspace();
                    const win = global.display.focus_window;

                    if (!this._isWindowValid(win)) {
                        return GLib.SOURCE_REMOVE;
                    }

                    const wmClass = win.get_wm_class();

                    if (!this._activeOrder.has(workspace)) {
                        this._activeOrder.set(workspace, new Map());
                        this._shadowOrder.set(workspace, new Map());
                    }

                    if (!this._activeOrder.get(workspace).has(wmClass)) {
                        this._activeOrder.get(workspace).set(wmClass, new Map());
                        this._shadowOrder.get(workspace).set(wmClass, new Map());
                    }

                    const activeClassOrder = this._activeOrder.get(workspace).get(wmClass);
                    const shadowClassOrder = this._shadowOrder.get(workspace).get(wmClass);

                    if (this._isSwitching) {
                        shadowClassOrder.set(win.get_id(), this._nextOrder++);
                    } else {
                        const validWindows = new Set(
                            global.display.get_tab_list(Meta.TabList.NORMAL, global.workspace_manager.get_active_workspace())
                                .filter((w) => this._isWindowValid(w) && w.get_wm_class() === wmClass)
                                .map((w) => w.get_id())
                        );

                        const sameAppWindows = [...shadowClassOrder.entries()]
                            .filter(([id]) => validWindows.has(id));

                        const mostRecentId = sameAppWindows.length > 0
                            ? sameAppWindows.reduce((a, b) => (a[1] > b[1] ? a : b))[0]
                            : null;

                        if (win.get_id() !== mostRecentId) {
                            const updatedShadow = new Map(shadowClassOrder);
                            activeClassOrder.clear();
                            for (const [key, value] of updatedShadow.entries()) {
                                activeClassOrder.set(key, value);
                            }
                            activeClassOrder.set(win.get_id(), this._nextOrder);
                            shadowClassOrder.set(win.get_id(), this._nextOrder);
                            this._nextOrder++;
                        }
                    }

                    return GLib.SOURCE_REMOVE;
                });
            });

            // Keybindings
            Main.wm.addKeybinding(
                'switch-windows-direct',
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => this._handleWindowSwitch(false)
            );

            Main.wm.addKeybinding(
                'switch-windows-direct-backward',
                this._settings,
                Meta.KeyBindingFlags.SHIFT_MASK,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => this._handleWindowSwitch(true)
            );

            Main.wm.addKeybinding(
                'switch-windows-direct-super',
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => this._handleWindowSwitch(false)
            );

            Main.wm.addKeybinding(
                'switch-windows-direct-super-backward',
                this._settings,
                Meta.KeyBindingFlags.SHIFT_MASK,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => this._handleWindowSwitch(true)
            );

        } catch (e) {
            logError('[NoOverlayWindowSwitcher] Error in enable:', e);
            logError('[NoOverlayWindowSwitcher] Stack:', e.stack);
        }
    }

    disable() {
        if (this._windowFocusedId) {
            global.display.disconnect(this._windowFocusedId);
            this._windowFocusedId = null;
        }
        if (this._workspaceSwitchedId) {
            global.workspace_manager.disconnect(this._workspaceSwitchedId);
            this._workspaceSwitchedId = null;
        }
        Main.wm.removeKeybinding('switch-windows-direct');
        Main.wm.removeKeybinding('switch-windows-direct-backward');
        Main.wm.removeKeybinding('switch-windows-direct-super');
        Main.wm.removeKeybinding('switch-windows-direct-super-backward');

        this._settings = null;
        this._activeOrder = null;
        this._shadowOrder = null;
    }

    _isWindowValid(win) {
        return win && !win.unmanaging && win.get_compositor_private() && !win.is_override_redirect();
    }

    _cleanupWorkspace(workspace) {
        const validWindows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
            .filter((w) => this._isWindowValid(w));

        const validWindowIds = new Set(validWindows.map((w) => w.get_id()));

        // Clean active and shadow orders for the workspace
        for (const [wmClass, classOrder] of (this._activeOrder.get(workspace) ?? new Map()).entries()) {
            for (const windowId of classOrder.keys()) {
                if (!validWindowIds.has(windowId)) {
                    classOrder.delete(windowId);
                }
            }
        }

        for (const [wmClass, classOrder] of (this._shadowOrder.get(workspace) ?? new Map()).entries()) {
            for (const windowId of classOrder.keys()) {
                if (!validWindowIds.has(windowId)) {
                    classOrder.delete(windowId);
                }
            }
        }
    }

    _handleWindowSwitch(backwards = false) {
        const workspace = global.workspace_manager.get_active_workspace();
        const focusedWindow = global.display.focus_window;

        if (!this._isWindowValid(focusedWindow)) {
            return;
        }

        const wmClass = focusedWindow.get_wm_class();
        const activeClassOrder = this._activeOrder.get(workspace)?.get(wmClass) ?? new Map();

        const windows = global.display.get_tab_list(Meta.TabList.NORMAL, workspace)
            .filter(w => this._isWindowValid(w) && w.get_wm_class() === wmClass)
            .map(w => ({
                id: w.get_id(),
                window: w,
                order: activeClassOrder.get(w.get_id()) ?? -1
            }))
            .sort((a, b) => b.order - a.order);

        if (windows.length <= 1) {
            return;
        }

        const currentIndex = windows.findIndex(w => w.id === focusedWindow.get_id());
        const nextIndex = backwards
            ? (currentIndex - 1 + windows.length) % windows.length
            : (currentIndex + 1) % windows.length;

        const nextWindow = windows[nextIndex].window;

        if (!this._isWindowValid(nextWindow)) {
            return;
        }

        this._isSwitching += 1;
        try {
            nextWindow.activate(global.display.get_current_time_roundtrip());
        } catch (e) {
            logError('[NoOverlayWindowSwitcher] Error activating window:', e);
        } finally {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                this._isSwitching -= 1;
                return GLib.SOURCE_REMOVE;
            });
        }
    }
}
