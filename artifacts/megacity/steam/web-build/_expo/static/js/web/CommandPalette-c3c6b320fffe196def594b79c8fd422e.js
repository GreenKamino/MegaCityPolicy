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
  Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function () {
      return CommandPalette;
    }
  });
  var _reactCompilerRuntime = require(_dependencyMap[0]);
  var _expoVectorIcons = require(_dependencyMap[1]);
  var _expoRouter = require(_dependencyMap[2]);
  var _react = require(_dependencyMap[3]);
  var _reactNativeWebDistExportsModal = require(_dependencyMap[4]);
  var Modal = _interopDefault(_reactNativeWebDistExportsModal);
  require(_dependencyMap[5]);
  var _reactNativeWebDistExportsPressable = require(_dependencyMap[6]);
  var Pressable = _interopDefault(_reactNativeWebDistExportsPressable);
  var _reactNativeWebDistExportsScrollView = require(_dependencyMap[7]);
  var ScrollView = _interopDefault(_reactNativeWebDistExportsScrollView);
  var _reactNativeWebDistExportsStyleSheet = require(_dependencyMap[8]);
  var StyleSheet = _interopDefault(_reactNativeWebDistExportsStyleSheet);
  var _reactNativeWebDistExportsText = require(_dependencyMap[9]);
  var Text = _interopDefault(_reactNativeWebDistExportsText);
  var _reactNativeWebDistExportsTextInput = require(_dependencyMap[10]);
  var TextInput = _interopDefault(_reactNativeWebDistExportsTextInput);
  var _reactNativeWebDistExportsUseWindowDimensions = require(_dependencyMap[11]);
  var useWindowDimensions = _interopDefault(_reactNativeWebDistExportsUseWindowDimensions);
  var _reactNativeWebDistExportsView = require(_dependencyMap[12]);
  var View = _interopDefault(_reactNativeWebDistExportsView);
  var _contextGameContext = require(_dependencyMap[13]);
  var _contextThemeContext = require(_dependencyMap[14]);
  var _engineCommandMenuCatalog = require(_dependencyMap[15]);
  var _engineCommandMenuStatus = require(_dependencyMap[16]);
  var _hooksUseThemedStyles = require(_dependencyMap[17]);
  var _reactJsxRuntime = require(_dependencyMap[18]);
  function iconFor(item, color) {
    if (item.icon.set === "feather") {
      return /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
        name: item.icon.name,
        size: 18,
        color: color
      });
    }
    return /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.MaterialCommunityIcons, {
      name: item.icon.name,
      size: 18,
      color: color
    });
  }
  function toneColor(status, colors) {
    if (!status) return colors.textMuted;
    if (status.tone === "critical") return colors.danger;
    if (status.tone === "pending") return colors.warning;
    return colors.accent;
  }
  function CommandPalette(t0) {
    const $ = (0, _reactCompilerRuntime.c)(140);
    const {
      visible,
      onClose
    } = t0;
    const router = (0, _expoRouter.useRouter)();
    const {
      state
    } = (0, _contextGameContext.useGameState)();
    const {
      colors
    } = (0, _contextThemeContext.useTheme)();
    const styles = useStyles();
    const {
      width,
      height
    } = (0, useWindowDimensions.default)();
    const inputRef = (0, _react.useRef)(null);
    const scrollRef = (0, _react.useRef)(null);
    const [query, setQuery] = (0, _react.useState)("");
    const [selectedIndex, setSelectedIndex] = (0, _react.useState)(0);
    let t1;
    if ($[0] !== state) {
      t1 = (0, _engineCommandMenuCatalog.getUnlockedCommandDestinations)(state);
      $[0] = state;
      $[1] = t1;
    } else {
      t1 = $[1];
    }
    const unlocked = t1;
    let t2;
    if ($[2] !== query || $[3] !== unlocked) {
      t2 = (0, _engineCommandMenuCatalog.searchCommandDestinations)(query, unlocked);
      $[2] = query;
      $[3] = unlocked;
      $[4] = t2;
    } else {
      t2 = $[4];
    }
    const results = t2;
    let t3;
    if ($[5] !== state) {
      t3 = (0, _engineCommandMenuStatus.getCommandMenuStatuses)(state);
      $[5] = state;
      $[6] = t3;
    } else {
      t3 = $[6];
    }
    const statuses = t3;
    const selected = results[selectedIndex] ?? results[0];
    let t4;
    if ($[7] !== onClose || $[8] !== router) {
      t4 = item => {
        if (!item) {
          return;
        }
        onClose();
        router.replace(item.route);
      };
      $[7] = onClose;
      $[8] = router;
      $[9] = t4;
    } else {
      t4 = $[9];
    }
    const run = t4;
    let t5;
    let t6;
    if ($[10] !== visible) {
      t5 = () => {
        if (!visible) {
          return;
        }
        setQuery("");
        setSelectedIndex(0);
        const timer = setTimeout(() => inputRef.current?.focus(), 40);
        return () => clearTimeout(timer);
      };
      t6 = [visible];
      $[10] = visible;
      $[11] = t5;
      $[12] = t6;
    } else {
      t5 = $[11];
      t6 = $[12];
    }
    (0, _react.useEffect)(t5, t6);
    let t7;
    if ($[13] === Symbol.for("react.memo_cache_sentinel")) {
      t7 = () => {
        setSelectedIndex(0);
      };
      $[13] = t7;
    } else {
      t7 = $[13];
    }
    let t8;
    if ($[14] !== query) {
      t8 = [query];
      $[14] = query;
      $[15] = t8;
    } else {
      t8 = $[15];
    }
    (0, _react.useEffect)(t7, t8);
    let t9;
    if ($[16] !== onClose || $[17] !== results.length || $[18] !== run || $[19] !== selected || $[20] !== visible) {
      t9 = () => {
        if (!visible || false) {
          return;
        }
        const onKeyDown = event => {
          if (event.key === "Escape" || (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }
          const tag = document.activeElement?.tagName;
          if (tag !== "INPUT" && tag !== "TEXTAREA") {
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex(current => Math.min(results.length - 1, current + 1));
          } else {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelectedIndex(_temp);
            } else {
              if (event.key === "Enter") {
                event.preventDefault();
                run(selected);
              }
            }
          }
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
      };
      $[16] = onClose;
      $[17] = results.length;
      $[18] = run;
      $[19] = selected;
      $[20] = visible;
      $[21] = t9;
    } else {
      t9 = $[21];
    }
    let t10;
    if ($[22] !== onClose || $[23] !== results.length || $[24] !== selected || $[25] !== visible) {
      t10 = [visible, results.length, selected, onClose];
      $[22] = onClose;
      $[23] = results.length;
      $[24] = selected;
      $[25] = visible;
      $[26] = t10;
    } else {
      t10 = $[26];
    }
    (0, _react.useEffect)(t9, t10);
    let t11;
    let t12;
    if ($[27] !== results.length || $[28] !== selectedIndex || $[29] !== visible) {
      t11 = () => {
        if (!visible || results.length === 0) {
          return;
        }
        scrollRef.current?.scrollTo({
          y: Math.max(0, selectedIndex * 62 - 62),
          animated: false
        });
      };
      t12 = [selectedIndex, results.length, visible];
      $[27] = results.length;
      $[28] = selectedIndex;
      $[29] = visible;
      $[30] = t11;
      $[31] = t12;
    } else {
      t11 = $[30];
      t12 = $[31];
    }
    (0, _react.useEffect)(t11, t12);
    if (!visible) {
      return null;
    }
    const t13 = styles.overlay;
    const t14 = styles.palette;
    const t15 = Math.min(680, Math.max(300, width - 24));
    const t16 = Math.min(720, height - 36);
    let t17;
    if ($[32] !== t15 || $[33] !== t16) {
      t17 = {
        width: t15,
        maxHeight: t16
      };
      $[32] = t15;
      $[33] = t16;
      $[34] = t17;
    } else {
      t17 = $[34];
    }
    let t18;
    if ($[35] !== styles.palette || $[36] !== t17) {
      t18 = [t14, t17];
      $[35] = styles.palette;
      $[36] = t17;
      $[37] = t18;
    } else {
      t18 = $[37];
    }
    let t19;
    if ($[38] !== styles.eyebrow) {
      t19 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: styles.eyebrow,
        children: "QUICK NAVIGATION"
      });
      $[38] = styles.eyebrow;
      $[39] = t19;
    } else {
      t19 = $[39];
    }
    let t20;
    if ($[40] !== styles.title) {
      t20 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: styles.title,
        children: "COMMAND PALETTE"
      });
      $[40] = styles.title;
      $[41] = t20;
    } else {
      t20 = $[41];
    }
    let t21;
    if ($[42] !== t19 || $[43] !== t20) {
      t21 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        children: [t19, t20]
      });
      $[42] = t19;
      $[43] = t20;
      $[44] = t21;
    } else {
      t21 = $[44];
    }
    let t22;
    if ($[45] !== colors.textMuted) {
      t22 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
        name: "x",
        size: 18,
        color: colors.textMuted
      });
      $[45] = colors.textMuted;
      $[46] = t22;
    } else {
      t22 = $[46];
    }
    let t23;
    if ($[47] !== onClose || $[48] !== styles.closeButton || $[49] !== t22) {
      t23 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Pressable.default, {
        accessibilityRole: "button",
        accessibilityLabel: "Close command palette",
        onPress: onClose,
        style: styles.closeButton,
        children: t22
      });
      $[47] = onClose;
      $[48] = styles.closeButton;
      $[49] = t22;
      $[50] = t23;
    } else {
      t23 = $[50];
    }
    let t24;
    if ($[51] !== styles.header || $[52] !== t21 || $[53] !== t23) {
      t24 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.header,
        children: [t21, t23]
      });
      $[51] = styles.header;
      $[52] = t21;
      $[53] = t23;
      $[54] = t24;
    } else {
      t24 = $[54];
    }
    let t25;
    if ($[55] !== colors.accent) {
      t25 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
        name: "search",
        size: 17,
        color: colors.accent
      });
      $[55] = colors.accent;
      $[56] = t25;
    } else {
      t25 = $[56];
    }
    let t26;
    if ($[57] !== run || $[58] !== selected) {
      t26 = () => run(selected);
      $[57] = run;
      $[58] = selected;
      $[59] = t26;
    } else {
      t26 = $[59];
    }
    let t27;
    if ($[60] !== colors.textMuted || $[61] !== query || $[62] !== styles.input || $[63] !== t26) {
      t27 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(TextInput.default, {
        ref: inputRef,
        testID: "command-palette-input",
        value: query,
        onChangeText: setQuery,
        placeholder: "Search law, money, officers, crises, sectors, research\u2026",
        placeholderTextColor: colors.textMuted,
        style: styles.input,
        autoCapitalize: "none",
        autoCorrect: false,
        returnKeyType: "go",
        onSubmitEditing: t26,
        accessibilityLabel: "Search command destinations"
      });
      $[60] = colors.textMuted;
      $[61] = query;
      $[62] = styles.input;
      $[63] = t26;
      $[64] = t27;
    } else {
      t27 = $[64];
    }
    let t28;
    if ($[65] !== styles.keyHint) {
      t28 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: styles.keyHint,
        children: "ESC"
      });
      $[65] = styles.keyHint;
      $[66] = t28;
    } else {
      t28 = $[66];
    }
    let t29;
    if ($[67] !== styles.searchBox || $[68] !== t25 || $[69] !== t27 || $[70] !== t28) {
      t29 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.searchBox,
        children: [t25, t27, t28]
      });
      $[67] = styles.searchBox;
      $[68] = t25;
      $[69] = t27;
      $[70] = t28;
      $[71] = t29;
    } else {
      t29 = $[71];
    }
    const t30 = results.length === 1 ? "" : "S";
    let t31;
    if ($[72] !== results.length || $[73] !== styles.resultCount || $[74] !== t30) {
      t31 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Text.default, {
        style: styles.resultCount,
        children: [results.length, " DESTINATION", t30]
      });
      $[72] = results.length;
      $[73] = styles.resultCount;
      $[74] = t30;
      $[75] = t31;
    } else {
      t31 = $[75];
    }
    let t32;
    if ($[76] !== styles.controllerHint) {
      t32 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: styles.controllerHint,
        children: "D-PAD / ARROWS \xB7 A / ENTER"
      });
      $[76] = styles.controllerHint;
      $[77] = t32;
    } else {
      t32 = $[77];
    }
    let t33;
    if ($[78] !== styles.resultMeta || $[79] !== t31 || $[80] !== t32) {
      t33 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.resultMeta,
        children: [t31, t32]
      });
      $[78] = styles.resultMeta;
      $[79] = t31;
      $[80] = t32;
      $[81] = t33;
    } else {
      t33 = $[81];
    }
    const t34 = styles.results;
    const t35 = styles.resultsContent;
    let t36;
    if ($[82] !== colors || $[83] !== results || $[84] !== run || $[85] !== selectedIndex || $[86] !== statuses || $[87] !== styles.group || $[88] !== styles.hotkey || $[89] !== styles.hotkeyText || $[90] !== styles.iconWrap || $[91] !== styles.label || $[92] !== styles.labelRow || $[93] !== styles.result || $[94] !== styles.resultText || $[95] !== styles.status || $[96] !== styles.statusText || $[97] !== styles.subtitle) {
      let t37;
      if ($[99] !== colors || $[100] !== run || $[101] !== selectedIndex || $[102] !== statuses || $[103] !== styles.group || $[104] !== styles.hotkey || $[105] !== styles.hotkeyText || $[106] !== styles.iconWrap || $[107] !== styles.label || $[108] !== styles.labelRow || $[109] !== styles.result || $[110] !== styles.resultText || $[111] !== styles.status || $[112] !== styles.statusText || $[113] !== styles.subtitle) {
        t37 = (item_0, index) => {
          const status = statuses[item_0.statusRoute ?? item_0.route];
          const statusTone = toneColor(status, colors);
          const active = index === selectedIndex;
          return /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Pressable.default, {
            testID: `command-result-${item_0.id}`,
            accessibilityRole: "button",
            accessibilityLabel: `Open ${item_0.label}${status ? `, ${status.label.toLowerCase()}` : ""}`,
            onFocus: () => setSelectedIndex(index),
            onHoverIn: () => setSelectedIndex(index),
            onPress: () => run(item_0),
            style: [styles.result, active && {
              borderColor: colors.accent,
              backgroundColor: colors.accent + "12"
            }, status?.tone === "critical" && {
              borderLeftColor: colors.danger,
              borderLeftWidth: 3
            }],
            children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(View.default, {
              style: [styles.iconWrap, {
                borderColor: active ? colors.accent : colors.borderBright
              }],
              children: iconFor(item_0, status?.tone === "critical" ? colors.danger : active ? colors.accent : colors.textMuted)
            }), /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
              style: styles.resultText,
              children: [/*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
                style: styles.labelRow,
                children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
                  style: [styles.label, active && {
                    color: colors.accent
                  }],
                  numberOfLines: 1,
                  children: item_0.label
                }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
                  style: styles.group,
                  children: item_0.group.toUpperCase()
                })]
              }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
                style: styles.subtitle,
                numberOfLines: 1,
                children: item_0.subtitle
              })]
            }), status && /*#__PURE__*/(0, _reactJsxRuntime.jsx)(View.default, {
              style: [styles.status, {
                borderColor: statusTone + "80",
                backgroundColor: statusTone + "16"
              }],
              children: /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
                style: [styles.statusText, {
                  color: statusTone
                }],
                numberOfLines: 1,
                children: status.label
              })
            }), item_0.hotkey && /*#__PURE__*/(0, _reactJsxRuntime.jsx)(View.default, {
              style: styles.hotkey,
              children: /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
                style: styles.hotkeyText,
                children: item_0.hotkey
              })
            }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
              name: "chevron-right",
              size: 15,
              color: active ? colors.accent : colors.textMuted
            })]
          }, item_0.id);
        };
        $[99] = colors;
        $[100] = run;
        $[101] = selectedIndex;
        $[102] = statuses;
        $[103] = styles.group;
        $[104] = styles.hotkey;
        $[105] = styles.hotkeyText;
        $[106] = styles.iconWrap;
        $[107] = styles.label;
        $[108] = styles.labelRow;
        $[109] = styles.result;
        $[110] = styles.resultText;
        $[111] = styles.status;
        $[112] = styles.statusText;
        $[113] = styles.subtitle;
        $[114] = t37;
      } else {
        t37 = $[114];
      }
      t36 = results.map(t37);
      $[82] = colors;
      $[83] = results;
      $[84] = run;
      $[85] = selectedIndex;
      $[86] = statuses;
      $[87] = styles.group;
      $[88] = styles.hotkey;
      $[89] = styles.hotkeyText;
      $[90] = styles.iconWrap;
      $[91] = styles.label;
      $[92] = styles.labelRow;
      $[93] = styles.result;
      $[94] = styles.resultText;
      $[95] = styles.status;
      $[96] = styles.statusText;
      $[97] = styles.subtitle;
      $[98] = t36;
    } else {
      t36 = $[98];
    }
    let t37;
    if ($[115] !== colors.textMuted || $[116] !== results.length || $[117] !== styles.empty || $[118] !== styles.emptyText || $[119] !== styles.emptyTitle) {
      t37 = results.length === 0 && /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.empty,
        children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
          name: "search",
          size: 22,
          color: colors.textMuted
        }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
          style: styles.emptyTitle,
          children: "NO MATCHING COMMAND"
        }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
          style: styles.emptyText,
          children: "Try a system name, role, resource, or destination."
        })]
      });
      $[115] = colors.textMuted;
      $[116] = results.length;
      $[117] = styles.empty;
      $[118] = styles.emptyText;
      $[119] = styles.emptyTitle;
      $[120] = t37;
    } else {
      t37 = $[120];
    }
    let t38;
    if ($[121] !== styles.results || $[122] !== styles.resultsContent || $[123] !== t36 || $[124] !== t37) {
      t38 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(ScrollView.default, {
        ref: scrollRef,
        style: t34,
        contentContainerStyle: t35,
        keyboardShouldPersistTaps: "handled",
        showsVerticalScrollIndicator: true,
        children: [t36, t37]
      });
      $[121] = styles.results;
      $[122] = styles.resultsContent;
      $[123] = t36;
      $[124] = t37;
      $[125] = t38;
    } else {
      t38 = $[125];
    }
    let t39;
    if ($[126] !== t18 || $[127] !== t24 || $[128] !== t29 || $[129] !== t33 || $[130] !== t38) {
      t39 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Pressable.default, {
        testID: "command-palette",
        style: t18,
        onPress: _temp2,
        accessibilityViewIsModal: true,
        children: [t24, t29, t33, t38]
      });
      $[126] = t18;
      $[127] = t24;
      $[128] = t29;
      $[129] = t33;
      $[130] = t38;
      $[131] = t39;
    } else {
      t39 = $[131];
    }
    let t40;
    if ($[132] !== onClose || $[133] !== styles.overlay || $[134] !== t39) {
      t40 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Pressable.default, {
        testID: "command-palette-overlay",
        style: t13,
        onPress: onClose,
        accessibilityLabel: "Close command palette",
        children: t39
      });
      $[132] = onClose;
      $[133] = styles.overlay;
      $[134] = t39;
      $[135] = t40;
    } else {
      t40 = $[135];
    }
    let t41;
    if ($[136] !== onClose || $[137] !== t40 || $[138] !== visible) {
      t41 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Modal.default, {
        transparent: true,
        animationType: "fade",
        visible: visible,
        onRequestClose: onClose,
        presentationStyle: "overFullScreen",
        children: t40
      });
      $[136] = onClose;
      $[137] = t40;
      $[138] = visible;
      $[139] = t41;
    } else {
      t41 = $[139];
    }
    return t41;
  }
  function _temp2(event_0) {
    return event_0.stopPropagation();
  }
  function _temp(current_0) {
    return Math.max(0, current_0 - 1);
  }
  const useStyles = (0, _hooksUseThemedStyles.makeThemedStyles)(Colors => StyleSheet.default.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.76)",
      alignItems: "center",
      justifyContent: "center",
      padding: 12
    },
    palette: Object.assign({
      backgroundColor: Colors.bgCard,
      borderWidth: 1,
      borderColor: Colors.accent,
      borderRadius: 8,
      overflow: "hidden"
    }, {
      boxShadow: `0 18px 60px ${Colors.bg}CC`
    }),
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border
    },
    eyebrow: {
      fontFamily: "Inter_700Bold",
      fontSize: 8,
      letterSpacing: 1.6,
      color: Colors.textMuted
    },
    title: {
      marginTop: 2,
      fontFamily: "Inter_700Bold",
      fontSize: 16,
      letterSpacing: 1.6,
      color: Colors.accent
    },
    closeButton: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: 4
    },
    searchBox: {
      minHeight: 48,
      marginHorizontal: 14,
      marginTop: 12,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: Colors.borderBright,
      backgroundColor: Colors.bg,
      borderRadius: 5
    },
    input: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 11,
      color: Colors.text,
      fontFamily: "Inter_500Medium",
      fontSize: 13,
      outlineStyle: "none"
    },
    keyHint: {
      fontFamily: "Inter_700Bold",
      fontSize: 8,
      letterSpacing: 0.8,
      color: Colors.textMuted,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: 3,
      paddingHorizontal: 5,
      paddingVertical: 3
    },
    resultMeta: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 6
    },
    resultCount: {
      fontFamily: "Inter_700Bold",
      fontSize: 8,
      letterSpacing: 1,
      color: Colors.textMuted
    },
    controllerHint: {
      fontFamily: "Inter_500Medium",
      fontSize: 8,
      letterSpacing: 0.7,
      color: Colors.textMuted
    },
    results: {
      flexGrow: 0
    },
    resultsContent: {
      paddingHorizontal: 12,
      paddingBottom: 12,
      gap: 6
    },
    result: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: Colors.border,
      borderRadius: 4,
      backgroundColor: Colors.bgSecondary
    },
    iconWrap: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderRadius: 4,
      backgroundColor: Colors.bg
    },
    resultText: {
      flex: 1,
      minWidth: 0
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8
    },
    label: {
      flexShrink: 1,
      fontFamily: "Inter_700Bold",
      fontSize: 11,
      letterSpacing: 0.8,
      color: Colors.text
    },
    group: {
      flexShrink: 0,
      fontFamily: "Inter_700Bold",
      fontSize: 7,
      letterSpacing: 0.7,
      color: Colors.textMuted
    },
    subtitle: {
      marginTop: 3,
      fontFamily: "Inter_400Regular",
      fontSize: 9,
      color: Colors.textMuted
    },
    status: {
      maxWidth: 110,
      borderWidth: 1,
      borderRadius: 3,
      paddingHorizontal: 5,
      paddingVertical: 3
    },
    statusText: {
      fontFamily: "Inter_700Bold",
      fontSize: 7,
      letterSpacing: 0.6
    },
    hotkey: {
      minWidth: 26,
      paddingHorizontal: 5,
      paddingVertical: 4,
      alignItems: "center",
      borderWidth: 1,
      borderColor: Colors.borderBright,
      borderRadius: 3,
      backgroundColor: Colors.bg
    },
    hotkeyText: {
      fontFamily: "Inter_700Bold",
      fontSize: 8,
      color: Colors.textSecondary
    },
    empty: {
      minHeight: 180,
      alignItems: "center",
      justifyContent: "center",
      gap: 8
    },
    emptyTitle: {
      fontFamily: "Inter_700Bold",
      fontSize: 11,
      letterSpacing: 1.2,
      color: Colors.textSecondary
    },
    emptyText: {
      fontFamily: "Inter_400Regular",
      fontSize: 10,
      color: Colors.textMuted,
      textAlign: "center"
    }
  }));
},1875,[11,723,15,13,480,126,365,282,148,135,390,506,274,863,798,1268,974,993,6]);