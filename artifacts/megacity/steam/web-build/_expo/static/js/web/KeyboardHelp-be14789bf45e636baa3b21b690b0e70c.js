__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  function _interopDefault(e) {
    return e && e.__esModule ? e : {
      default: e
    };
  }
  Object.defineProperty(exports, "useKeyboardHelp", {
    enumerable: true,
    get: function () {
      return _hooksUseKeyboardHelp.useKeyboardHelp;
    }
  });
  Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function () {
      return KeyboardHelp;
    }
  });
  var _reactCompilerRuntime = require(_dependencyMap[0]);
  require(_dependencyMap[1]);
  var _reactNativeWebDistExportsModal = require(_dependencyMap[2]);
  var Modal = _interopDefault(_reactNativeWebDistExportsModal);
  var _reactNativeWebDistExportsPressable = require(_dependencyMap[3]);
  var Pressable = _interopDefault(_reactNativeWebDistExportsPressable);
  var _reactNativeWebDistExportsScrollView = require(_dependencyMap[4]);
  var ScrollView = _interopDefault(_reactNativeWebDistExportsScrollView);
  var _reactNativeWebDistExportsStyleSheet = require(_dependencyMap[5]);
  var StyleSheet = _interopDefault(_reactNativeWebDistExportsStyleSheet);
  var _reactNativeWebDistExportsText = require(_dependencyMap[6]);
  var Text = _interopDefault(_reactNativeWebDistExportsText);
  var _reactNativeWebDistExportsView = require(_dependencyMap[7]);
  var View = _interopDefault(_reactNativeWebDistExportsView);
  require(_dependencyMap[8]);
  var _hooksUseThemedStyles = require(_dependencyMap[9]);
  var _contextGameContext = require(_dependencyMap[10]);
  var _componentsKeyboardHelpSections = require(_dependencyMap[11]);
  var _reactJsxRuntime = require(_dependencyMap[12]);
  var _hooksUseKeyboardHelp = require(_dependencyMap[13]);
  const isWeb = true;
  function KeyboardHelp(t0) {
    const $ = (0, _reactCompilerRuntime.c)(69);
    const {
      visible,
      onClose
    } = t0;
    const {
      state
    } = (0, _contextGameContext.useGameState)();
    const styles = useStyles();
    if (!visible) {
      return null;
    }
    let T0;
    let T1;
    let T2;
    let T3;
    let t1;
    let t10;
    let t11;
    let t12;
    let t2;
    let t3;
    let t4;
    let t5;
    let t6;
    let t7;
    let t8;
    let t9;
    if ($[0] !== onClose || $[1] !== state.gameplayMode || $[2] !== styles.actionText || $[3] !== styles.dismiss || $[4] !== styles.header || $[5] !== styles.keyBadge || $[6] !== styles.keyText || $[7] !== styles.modal || $[8] !== styles.overlay || $[9] !== styles.row || $[10] !== styles.scroll || $[11] !== styles.section || $[12] !== styles.sectionTitle || $[13] !== styles.title || $[14] !== visible) {
      const sections = (0, _componentsKeyboardHelpSections.buildKeyboardSections)(state.gameplayMode === "turnbased");
      T3 = Modal.default;
      t9 = true;
      t10 = "fade";
      t11 = visible;
      t12 = onClose;
      T2 = Pressable.default;
      t7 = styles.overlay;
      t8 = onClose;
      T1 = Pressable.default;
      t4 = styles.modal;
      t5 = _temp;
      let t13;
      if ($[31] !== styles.title) {
        t13 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
          style: styles.title,
          children: "KEYBOARD SHORTCUTS"
        });
        $[31] = styles.title;
        $[32] = t13;
      } else {
        t13 = $[32];
      }
      let t14;
      if ($[33] !== styles.dismiss) {
        t14 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
          style: styles.dismiss,
          children: "Press ? to close"
        });
        $[33] = styles.dismiss;
        $[34] = t14;
      } else {
        t14 = $[34];
      }
      if ($[35] !== styles.header || $[36] !== t13 || $[37] !== t14) {
        t6 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
          style: styles.header,
          children: [t13, t14]
        });
        $[35] = styles.header;
        $[36] = t13;
        $[37] = t14;
        $[38] = t6;
      } else {
        t6 = $[38];
      }
      T0 = ScrollView.default;
      t1 = styles.scroll;
      t2 = false;
      let t15;
      if ($[39] !== styles.actionText || $[40] !== styles.keyBadge || $[41] !== styles.keyText || $[42] !== styles.row || $[43] !== styles.section || $[44] !== styles.sectionTitle) {
        t15 = section => /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
          style: styles.section,
          children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
            style: styles.sectionTitle,
            children: section.title
          }), section.keys.map(binding => /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
            style: styles.row,
            children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(View.default, {
              style: styles.keyBadge,
              children: /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
                style: styles.keyText,
                children: binding.key
              })
            }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
              style: styles.actionText,
              children: binding.action
            })]
          }, binding.key))]
        }, section.title);
        $[39] = styles.actionText;
        $[40] = styles.keyBadge;
        $[41] = styles.keyText;
        $[42] = styles.row;
        $[43] = styles.section;
        $[44] = styles.sectionTitle;
        $[45] = t15;
      } else {
        t15 = $[45];
      }
      t3 = sections.map(t15);
      $[0] = onClose;
      $[1] = state.gameplayMode;
      $[2] = styles.actionText;
      $[3] = styles.dismiss;
      $[4] = styles.header;
      $[5] = styles.keyBadge;
      $[6] = styles.keyText;
      $[7] = styles.modal;
      $[8] = styles.overlay;
      $[9] = styles.row;
      $[10] = styles.scroll;
      $[11] = styles.section;
      $[12] = styles.sectionTitle;
      $[13] = styles.title;
      $[14] = visible;
      $[15] = T0;
      $[16] = T1;
      $[17] = T2;
      $[18] = T3;
      $[19] = t1;
      $[20] = t10;
      $[21] = t11;
      $[22] = t12;
      $[23] = t2;
      $[24] = t3;
      $[25] = t4;
      $[26] = t5;
      $[27] = t6;
      $[28] = t7;
      $[29] = t8;
      $[30] = t9;
    } else {
      T0 = $[15];
      T1 = $[16];
      T2 = $[17];
      T3 = $[18];
      t1 = $[19];
      t10 = $[20];
      t11 = $[21];
      t12 = $[22];
      t2 = $[23];
      t3 = $[24];
      t4 = $[25];
      t5 = $[26];
      t6 = $[27];
      t7 = $[28];
      t8 = $[29];
      t9 = $[30];
    }
    let t13;
    if ($[46] !== T0 || $[47] !== t1 || $[48] !== t2 || $[49] !== t3) {
      t13 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(T0, {
        style: t1,
        showsVerticalScrollIndicator: t2,
        children: t3
      });
      $[46] = T0;
      $[47] = t1;
      $[48] = t2;
      $[49] = t3;
      $[50] = t13;
    } else {
      t13 = $[50];
    }
    let t14;
    if ($[51] !== T1 || $[52] !== t13 || $[53] !== t4 || $[54] !== t5 || $[55] !== t6) {
      t14 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(T1, {
        style: t4,
        onPress: t5,
        children: [t6, t13]
      });
      $[51] = T1;
      $[52] = t13;
      $[53] = t4;
      $[54] = t5;
      $[55] = t6;
      $[56] = t14;
    } else {
      t14 = $[56];
    }
    let t15;
    if ($[57] !== T2 || $[58] !== t14 || $[59] !== t7 || $[60] !== t8) {
      t15 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(T2, {
        style: t7,
        onPress: t8,
        children: t14
      });
      $[57] = T2;
      $[58] = t14;
      $[59] = t7;
      $[60] = t8;
      $[61] = t15;
    } else {
      t15 = $[61];
    }
    let t16;
    if ($[62] !== T3 || $[63] !== t10 || $[64] !== t11 || $[65] !== t12 || $[66] !== t15 || $[67] !== t9) {
      t16 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(T3, {
        transparent: t9,
        animationType: t10,
        visible: t11,
        onRequestClose: t12,
        children: t15
      });
      $[62] = T3;
      $[63] = t10;
      $[64] = t11;
      $[65] = t12;
      $[66] = t15;
      $[67] = t9;
      $[68] = t16;
    } else {
      t16 = $[68];
    }
    return t16;
  }
  function _temp(e) {
    return e.stopPropagation();
  }
  const useStyles = (0, _hooksUseThemedStyles.makeThemedStyles)(Colors => StyleSheet.default.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.7)",
      justifyContent: "center",
      alignItems: "center"
    },
    modal: {
      backgroundColor: Colors.bgCard,
      borderWidth: 1,
      borderColor: Colors.accent,
      borderRadius: 8,
      width: 420,
      maxHeight: "80%",
      padding: 20
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
      paddingBottom: 12
    },
    title: {
      fontFamily: "Inter_700Bold",
      fontSize: 16,
      color: Colors.accent,
      letterSpacing: 2
    },
    dismiss: {
      fontFamily: "Inter_400Regular",
      fontSize: 10,
      color: Colors.textMuted
    },
    scroll: {
      flex: 1
    },
    section: {
      marginBottom: 16
    },
    sectionTitle: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 10,
      color: Colors.textMuted,
      letterSpacing: 1.5,
      marginBottom: 8
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
      gap: 12
    },
    keyBadge: {
      backgroundColor: Colors.bgElevated,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      minWidth: 40,
      alignItems: "center"
    },
    keyText: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 11,
      color: Colors.text,
      letterSpacing: 0.5
    },
    actionText: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: Colors.textSecondary
    }
  }));
},1874,[11,13,480,365,282,148,135,274,126,993,863,1878,6,1005]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  exports.buildKeyboardSections = buildKeyboardSections;
  // Keyboard-help content, kept as node-safe pure data (no react-native imports)
  // so the mode-aware wiring can be unit tested directly. KeyboardHelp.tsx renders
  // whatever buildKeyboardSections returns.
  //
  // Why mode-aware: in turn-based mode the real-time tick loop is off, so Space /
  // controller X / Start drive End Turn instead of Pause, and the speed controls
  // (+ / - / game speed) do nothing. The overlay must never tell a turn-based
  // player to pause or change speed — see engine/turnMode.ts.

  function buildKeyboardSections(isTurnBased) {
    // Space / X / Start pause in real-time, end the turn in turn-based.
    const advanceAction = isTurnBased ? "End Turn" : "Pause / Resume";
    const gameControls = [{
      key: "Space",
      action: advanceAction
    },
    // Simulation speed only exists while the real-time clock is running.
    ...(isTurnBased ? [] : [{
      key: "+  /  =",
      action: "Increase Game Speed"
    }, {
      key: "−",
      action: "Decrease Game Speed"
    }]), {
      key: "F",
      action: "Toggle Fullscreen"
    }, {
      key: "H",
      action: "Photo Mode (clean screenshot)"
    }, {
      key: "F9",
      action: "Steam screenshot (1920×1080) — desktop build"
    }, {
      key: "D",
      action: "Open Debug Console"
    }, {
      key: "Ctrl+D",
      action: "Toggle Debug Console"
    }, {
      key: "Esc",
      action: "Return to City Overview"
    }];
    const controller = [{
      key: "D-Pad / Stick",
      action: "Move selection"
    }, {
      key: "A",
      action: "Activate selected control"
    }, {
      key: "B",
      action: "Back / cancel"
    }, {
      key: "X",
      action: advanceAction
    }, {
      key: "Y",
      action: "Show this help overlay"
    }, {
      key: "LB / RB",
      action: "Previous / Next top tab (incl. promoted tabs on screen)"
    }, {
      key: "LT / RT",
      action: "Previous / Next sub-tab"
    }, {
      key: "Start",
      action: advanceAction
    }, {
      key: "Select",
      action: "Open command palette / quick navigation"
    }];
    return [{
      title: "NAVIGATION — TOP BAR",
      keys: [{
        key: "1",
        action: "City (Overview)"
      }, {
        key: "2",
        action: "Law & Edicts"
      }, {
        key: "3",
        action: "Economy"
      }, {
        key: "4",
        action: "Map (World Map)"
      }, {
        key: "5",
        action: "Build (Construction)"
      }, {
        key: "6",
        action: "Diplomacy"
      }, {
        key: "7",
        action: "More — Command Menus"
      }]
    }, {
      title: "NAVIGATION — PROMOTED TABS (WHEN SHOWN)",
      keys: [{
        key: "⇧1",
        action: "Inbox"
      }, {
        key: "⇧2",
        action: "Stats"
      }, {
        key: "⇧3",
        action: "Research"
      }, {
        key: "⇧4",
        action: "Missions"
      }, {
        key: "⇧5",
        action: "Finance"
      }, {
        key: "⇧6",
        action: "Officers"
      }, {
        key: "⇧7",
        action: "Sectors"
      }, {
        key: "⇧8",
        action: "Trade"
      }, {
        key: "⇧9",
        action: "Codex"
      }]
    }, {
      title: "NAVIGATION — BOTTOM BAR",
      keys: [{
        key: "Q",
        action: "Inbox"
      }, {
        key: "W",
        action: "Research"
      }, {
        key: "E",
        action: "Military"
      }, {
        key: "R",
        action: "Factions"
      }, {
        key: "T",
        action: "Events"
      }, {
        key: "Y",
        action: "Wildlands"
      }, {
        key: "U",
        action: "Dossier (Commander)"
      }]
    }, {
      title: "SAVE & SYSTEM",
      keys: [{
        key: "Ctrl+S",
        action: "Quick save (disabled in Honor Mode)"
      }, {
        key: "Ctrl / Cmd+K",
        action: "Open command palette / quick navigation"
      }, {
        key: "?",
        action: "Toggle this overlay"
      }]
    }, {
      title: "GAME CONTROLS",
      keys: gameControls
    }, {
      title: "FOCUS & SELECTION",
      keys: [{
        key: "↑ ↓ ← →",
        action: "Move selection between on-screen controls"
      }, {
        key: "Tab",
        action: "Cycle focus forward / Shift+Tab back"
      }, {
        key: "Enter",
        action: "Activate the selected control"
      }, {
        key: "← →",
        action: "Switch sub-tabs at the edge of a row"
      }]
    }, {
      title: "CONTROLLER / STEAM DECK",
      keys: controller
    }, {
      title: "WORLD MAP",
      keys: [{
        key: "Scroll Wheel",
        action: "Zoom In / Out"
      }, {
        key: "Click + Drag",
        action: "Pan Map"
      }, {
        key: "Right-Click",
        action: "Context Menu"
      }]
    }];
  }
},1878,[]);