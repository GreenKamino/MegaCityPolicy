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
      return _default;
    }
  });
  var _reactCompilerRuntime = require(_dependencyMap[0]);
  var _react = require(_dependencyMap[1]);
  var React = _interopDefault(_react);
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
  var _expoVectorIcons = require(_dependencyMap[8]);
  var _expoRouter = require(_dependencyMap[9]);
  var _contextGameContext = require(_dependencyMap[10]);
  var _contextThemeContext = require(_dependencyMap[11]);
  var _dataChangelog = require(_dependencyMap[12]);
  var _constantsVersion = require(_dependencyMap[13]);
  var _reactJsxRuntime = require(_dependencyMap[14]);
  // Pops once after the player updates to a new APP_VERSION. Skipped on
  // first-ever launch (lastSeenVersion === undefined) — the modal is for
  // returning players, not for someone seeing the patch notes for the first
  // time before they've even played a turn.
  //
  // "Dismiss" calls markChangelogSeen() which writes APP_VERSION into save state.
  // "View full history" routes to the existing changelog screen and also marks
  // the version as seen so the modal doesn't reopen on next launch.
  //
  // NOTE: Once-per-build gating is intentionally not user-tunable. Don't wire
  // the SettingsContext `skipIntro` flag here — see SettingsContext for the
  // rationale on what `skipIntro` actually controls.
  function WhatsNewModal() {
    const $ = (0, _reactCompilerRuntime.c)(66);
    const {
      state,
      isLoaded,
      markChangelogSeen
    } = (0, _contextGameContext.useGame)();
    const {
      colors: c
    } = (0, _contextThemeContext.useTheme)();
    const latest = _dataChangelog.CHANGELOG[0] ?? null;
    if (!isLoaded || !latest) {
      return null;
    }
    if (state.lastSeenVersion === undefined) {
      queueMicrotask(() => markChangelogSeen());
      return null;
    }
    if (state.lastSeenVersion === _constantsVersion.APP_VERSION) {
      return null;
    }
    if (state.lastSeenVersion === latest.version) {
      return null;
    }
    const t0 = c.bg + "DD";
    let t1;
    if ($[0] !== t0) {
      t1 = [styles.backdrop, {
        backgroundColor: t0
      }];
      $[0] = t0;
      $[1] = t1;
    } else {
      t1 = $[1];
    }
    let t2;
    if ($[2] !== c.accent || $[3] !== c.bgCard) {
      t2 = [styles.card, {
        backgroundColor: c.bgCard,
        borderColor: c.accent
      }];
      $[2] = c.accent;
      $[3] = c.bgCard;
      $[4] = t2;
    } else {
      t2 = $[4];
    }
    let t3;
    if ($[5] !== c.accent) {
      t3 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.MaterialCommunityIcons, {
        name: "rocket-launch-outline",
        size: 20,
        color: c.accent
      });
      $[5] = c.accent;
      $[6] = t3;
    } else {
      t3 = $[6];
    }
    let t4;
    if ($[7] === Symbol.for("react.memo_cache_sentinel")) {
      t4 = {
        flex: 1
      };
      $[7] = t4;
    } else {
      t4 = $[7];
    }
    let t5;
    if ($[8] !== c.accent) {
      t5 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Text.default, {
        style: [styles.eyebrow, {
          color: c.accent
        }],
        children: ["WHAT'S NEW IN MEGACITY ", latest.version]
      });
      $[8] = c.accent;
      $[9] = t5;
    } else {
      t5 = $[9];
    }
    let t6;
    if ($[10] !== c.text) {
      t6 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: [styles.title, {
          color: c.text
        }],
        children: latest.title
      });
      $[10] = c.text;
      $[11] = t6;
    } else {
      t6 = $[11];
    }
    let t7;
    if ($[12] !== c.textMuted) {
      t7 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: [styles.date, {
          color: c.textMuted
        }],
        children: latest.date
      });
      $[12] = c.textMuted;
      $[13] = t7;
    } else {
      t7 = $[13];
    }
    let t8;
    if ($[14] !== t5 || $[15] !== t6 || $[16] !== t7) {
      t8 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: t4,
        children: [t5, t6, t7]
      });
      $[14] = t5;
      $[15] = t6;
      $[16] = t7;
      $[17] = t8;
    } else {
      t8 = $[17];
    }
    let t9;
    if ($[18] !== t3 || $[19] !== t8) {
      t9 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.header,
        children: [t3, t8]
      });
      $[18] = t3;
      $[19] = t8;
      $[20] = t9;
    } else {
      t9 = $[20];
    }
    let t10;
    if ($[21] === Symbol.for("react.memo_cache_sentinel")) {
      t10 = {
        paddingBottom: 12
      };
      $[21] = t10;
    } else {
      t10 = $[21];
    }
    let t11;
    if ($[22] !== c.accent || $[23] !== c.textSecondary || $[24] !== c.warning) {
      t11 = latest.sections.map(section => /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.section,
        children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
          style: [styles.sectionHeading, {
            color: c.warning
          }],
          children: section.heading.toUpperCase()
        }), section.items.map((item, idx) => /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
          style: styles.bulletRow,
          children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
            style: [styles.bulletDot, {
              color: c.accent
            }],
            children: "\u2022"
          }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
            style: [styles.bulletText, {
              color: c.textSecondary
            }],
            children: item
          })]
        }, idx))]
      }, section.heading));
      $[22] = c.accent;
      $[23] = c.textSecondary;
      $[24] = c.warning;
      $[25] = t11;
    } else {
      t11 = $[25];
    }
    let t12;
    if ($[26] !== t11) {
      t12 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(ScrollView.default, {
        style: styles.body,
        contentContainerStyle: t10,
        children: t11
      });
      $[26] = t11;
      $[27] = t12;
    } else {
      t12 = $[27];
    }
    let t13;
    if ($[28] !== markChangelogSeen) {
      t13 = () => {
        markChangelogSeen();
        _expoRouter.router.push("/(game)/changelog");
      };
      $[28] = markChangelogSeen;
      $[29] = t13;
    } else {
      t13 = $[29];
    }
    let t14;
    if ($[30] !== c.bg || $[31] !== c.border) {
      t14 = t15 => {
        const {
          pressed
        } = t15;
        return [styles.btn, {
          backgroundColor: c.bg,
          borderColor: c.border
        }, pressed && styles.btnPressed];
      };
      $[30] = c.bg;
      $[31] = c.border;
      $[32] = t14;
    } else {
      t14 = $[32];
    }
    let t15;
    if ($[33] !== c.info) {
      t15 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
        name: "book-open",
        size: 14,
        color: c.info
      });
      $[33] = c.info;
      $[34] = t15;
    } else {
      t15 = $[34];
    }
    let t16;
    if ($[35] !== c.info) {
      t16 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: [styles.btnText, {
          color: c.info
        }],
        children: "VIEW FULL HISTORY"
      });
      $[35] = c.info;
      $[36] = t16;
    } else {
      t16 = $[36];
    }
    let t17;
    if ($[37] !== t13 || $[38] !== t14 || $[39] !== t15 || $[40] !== t16) {
      t17 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Pressable.default, {
        onPress: t13,
        style: t14,
        children: [t15, t16]
      });
      $[37] = t13;
      $[38] = t14;
      $[39] = t15;
      $[40] = t16;
      $[41] = t17;
    } else {
      t17 = $[41];
    }
    let t18;
    let t19;
    if ($[42] !== c.accent) {
      t18 = t20 => {
        const {
          pressed: pressed_0
        } = t20;
        return [styles.btn, styles.btnPrimary, {
          backgroundColor: c.accent + "20",
          borderColor: c.accent
        }, pressed_0 && styles.btnPressed];
      };
      t19 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
        name: "check",
        size: 14,
        color: c.accent
      });
      $[42] = c.accent;
      $[43] = t18;
      $[44] = t19;
    } else {
      t18 = $[43];
      t19 = $[44];
    }
    let t20;
    if ($[45] !== c.accent) {
      t20 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: [styles.btnText, {
          color: c.accent
        }],
        children: "DISMISS"
      });
      $[45] = c.accent;
      $[46] = t20;
    } else {
      t20 = $[46];
    }
    let t21;
    if ($[47] !== markChangelogSeen || $[48] !== t18 || $[49] !== t19 || $[50] !== t20) {
      t21 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Pressable.default, {
        onPress: markChangelogSeen,
        style: t18,
        children: [t19, t20]
      });
      $[47] = markChangelogSeen;
      $[48] = t18;
      $[49] = t19;
      $[50] = t20;
      $[51] = t21;
    } else {
      t21 = $[51];
    }
    let t22;
    if ($[52] !== t17 || $[53] !== t21) {
      t22 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: styles.footer,
        children: [t17, t21]
      });
      $[52] = t17;
      $[53] = t21;
      $[54] = t22;
    } else {
      t22 = $[54];
    }
    let t23;
    if ($[55] !== t12 || $[56] !== t2 || $[57] !== t22 || $[58] !== t9) {
      t23 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
        style: t2,
        children: [t9, t12, t22]
      });
      $[55] = t12;
      $[56] = t2;
      $[57] = t22;
      $[58] = t9;
      $[59] = t23;
    } else {
      t23 = $[59];
    }
    let t24;
    if ($[60] !== t1 || $[61] !== t23) {
      t24 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(View.default, {
        style: t1,
        children: t23
      });
      $[60] = t1;
      $[61] = t23;
      $[62] = t24;
    } else {
      t24 = $[62];
    }
    let t25;
    if ($[63] !== markChangelogSeen || $[64] !== t24) {
      t25 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Modal.default, {
        visible: true,
        transparent: true,
        animationType: "fade",
        onRequestClose: markChangelogSeen,
        children: t24
      });
      $[63] = markChangelogSeen;
      $[64] = t24;
      $[65] = t25;
    } else {
      t25 = $[65];
    }
    return t25;
  }
  var _default = /*#__PURE__*/React.default.memo(WhatsNewModal);
  const styles = StyleSheet.default.create({
    backdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 20
    },
    card: {
      width: "100%",
      maxWidth: 560,
      maxHeight: "85%",
      borderWidth: 1,
      borderRadius: 4,
      paddingTop: 18,
      paddingHorizontal: 18,
      paddingBottom: 14
    },
    header: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 14
    },
    eyebrow: {
      fontFamily: "ShareTechMono_400Regular",
      fontSize: 11,
      letterSpacing: 1.4,
      marginBottom: 2
    },
    title: {
      fontFamily: "Inter_700Bold",
      fontSize: 16,
      letterSpacing: 0.5,
      marginBottom: 2
    },
    date: {
      fontFamily: "ShareTechMono_400Regular",
      fontSize: 11
    },
    body: {
      flexShrink: 1
    },
    section: {
      marginBottom: 14
    },
    sectionHeading: {
      fontFamily: "ShareTechMono_400Regular",
      fontSize: 11,
      letterSpacing: 1.6,
      marginBottom: 6
    },
    bulletRow: {
      flexDirection: "row",
      gap: 8,
      paddingVertical: 3
    },
    bulletDot: {
      fontFamily: "ShareTechMono_400Regular",
      fontSize: 12,
      lineHeight: 18
    },
    bulletText: {
      flex: 1,
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      lineHeight: 18
    },
    footer: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 8
    },
    btn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderRadius: 2
    },
    btnPrimary: {
      minWidth: 110,
      justifyContent: "center"
    },
    btnPressed: {
      opacity: 0.7
    },
    btnText: {
      fontFamily: "ShareTechMono_400Regular",
      fontSize: 11,
      letterSpacing: 1.2
    }
  });
},1876,[11,13,480,365,282,148,135,274,723,15,863,798,1053,968,6]);