
# No Overlay Window Switcher

To install disable (or move to another key combo) "Switch windows of
an application" in Gnome Settings -> Keyboard -> View and Customize
Shortcuts -> Navigation. Then copy the contents of the extension to
.local and compile the glib schemas using the commands below. At that
point, you can enable the extension via the Extensions app (you may
have to restart the Gnome Shell).

```console
$ cp -a ../no-overlay-window-switcher ~/.local/share/gnome-shell/extensions/
$ glib-compile-schemas ~/.local/share/gnome-shell/extensions/no-overlay-window-switcher/schemas/
```

By default, there are no settings for this extension, but it binds to
Alt-\` (Alt-<grave>) and Super-\` (Super-<grave>), and to cycle
through the reverse order of windows is Shift-Alt-\` &
Shift-Super-\`. You should see instant switching of windows of an
application. It also honors window order when switching workstations
and applications, so they aren't forgotten.

There are two problems that haven't been diagnosed yet, one is when
spamming window switches this error is in the logs:

```
Window manager warning: last_focus_time (4363614) is greater than comparison timestamp (4363611).  This most likely represents a buggy client sending inaccurate timestamps in messages such as _NET_ACTIVE_WINDOW.  Trying to work around...
Window manager warning: last_user_time (4363614) is greater than comparison timestamp (4363611).  This most likely represents a buggy client sending inaccurate timestamps in messages such as _NET_ACTIVE_WINDOW.  Trying to work around...
Window manager warning: W6 (user@host: ~) appears to be one of the offending windows with a timestamp of 4363614.  Working around...
```

And typical usage has produced this error, which isn't reproduced
reliably, yet:

```
Window manager warning: Ping serial 8045676 was reused for window W22 (user@host: ~/.local/share/gnome-shell/extensions/no-overlay-window-switcher), previous use was for window W23 (user@host: ~/projects/no-overlay-window-switcher).
```

Gnome Extensions experts are welcome to suggest improvements!



Debugging tip to see Gnome error logging:

```console
$ journalctl /usr/bin/gnome-shell -f -o cat
```
