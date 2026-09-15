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
      return AchievementReport;
    }
  });
  var _reactCompilerRuntime = require(_dependencyMap[0]);
  var _expoVectorIcons = require(_dependencyMap[1]);
  require(_dependencyMap[2]);
  var _reactNativeWebDistExportsModal = require(_dependencyMap[3]);
  var Modal = _interopDefault(_reactNativeWebDistExportsModal);
  require(_dependencyMap[4]);
  var _reactNativeWebDistExportsPressable = require(_dependencyMap[5]);
  var Pressable = _interopDefault(_reactNativeWebDistExportsPressable);
  var _reactNativeWebDistExportsScrollView = require(_dependencyMap[6]);
  var ScrollView = _interopDefault(_reactNativeWebDistExportsScrollView);
  var _reactNativeWebDistExportsStyleSheet = require(_dependencyMap[7]);
  var StyleSheet = _interopDefault(_reactNativeWebDistExportsStyleSheet);
  var _reactNativeWebDistExportsText = require(_dependencyMap[8]);
  var Text = _interopDefault(_reactNativeWebDistExportsText);
  var _reactNativeWebDistExportsView = require(_dependencyMap[9]);
  var View = _interopDefault(_reactNativeWebDistExportsView);
  var _reactNativeSafeAreaContext = require(_dependencyMap[10]);
  var _contextThemeContext = require(_dependencyMap[11]);
  var _hooksUseThemedStyles = require(_dependencyMap[12]);
  var _contextGameContext = require(_dependencyMap[13]);
  var _engineAchievements = require(_dependencyMap[14]);
  var _reactJsxRuntime = require(_dependencyMap[15]);
  function AchievementReport() {
    const $ = (0, _reactCompilerRuntime.c)(89);
    const {
      colors: Colors
    } = (0, _contextThemeContext.useTheme)();
    const styles = useStyles();
    const insets = (0, _reactNativeSafeAreaContext.useSafeAreaInsets)();
    const {
      pendingAchievements,
      dismissAchievementReport
    } = (0, _contextGameContext.useGame)();
    const topInset = Math.max(insets.top, 67);
    if (pendingAchievements.length === 0) {
      return null;
    }
    let T0;
    let T1;
    let T2;
    let T3;
    let t0;
    let t1;
    let t2;
    let t3;
    let t4;
    let t5;
    let t6;
    let t7;
    let t8;
    let t9;
    if ($[0] !== Colors.textMuted || $[1] !== Colors.warning || $[2] !== dismissAchievementReport || $[3] !== pendingAchievements || $[4] !== styles.achDesc || $[5] !== styles.achIcon || $[6] !== styles.achInfo || $[7] !== styles.achName || $[8] !== styles.achRow || $[9] !== styles.container || $[10] !== styles.header || $[11] !== styles.headerIcon || $[12] !== styles.list || $[13] !== styles.overlay || $[14] !== styles.title || $[15] !== topInset) {
      const achDefs = pendingAchievements.map(_temp).filter(Boolean);
      T3 = Modal.default;
      t6 = pendingAchievements.length > 0;
      t7 = "fade";
      t8 = true;
      t9 = dismissAchievementReport;
      T2 = View.default;
      t5 = styles.overlay;
      T1 = View.default;
      const t10 = topInset + 20;
      let t11;
      if ($[30] !== t10) {
        t11 = {
          marginTop: t10
        };
        $[30] = t10;
        $[31] = t11;
      } else {
        t11 = $[31];
      }
      if ($[32] !== styles.container || $[33] !== t11) {
        t3 = [styles.container, t11];
        $[32] = styles.container;
        $[33] = t11;
        $[34] = t3;
      } else {
        t3 = $[34];
      }
      let t12;
      if ($[35] !== Colors.warning) {
        t12 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
          name: "award",
          size: 20,
          color: Colors.warning
        });
        $[35] = Colors.warning;
        $[36] = t12;
      } else {
        t12 = $[36];
      }
      let t13;
      if ($[37] !== styles.headerIcon || $[38] !== t12) {
        t13 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(View.default, {
          style: styles.headerIcon,
          children: t12
        });
        $[37] = styles.headerIcon;
        $[38] = t12;
        $[39] = t13;
      } else {
        t13 = $[39];
      }
      const t14 = achDefs.length > 1 ? "S" : "";
      let t15;
      if ($[40] !== styles.title || $[41] !== t14) {
        t15 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(Text.default, {
          style: styles.title,
          children: ["ACHIEVEMENT", t14, " UNLOCKED"]
        });
        $[40] = styles.title;
        $[41] = t14;
        $[42] = t15;
      } else {
        t15 = $[42];
      }
      let t16;
      if ($[43] !== Colors.textMuted) {
        t16 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
          name: "x",
          size: 18,
          color: Colors.textMuted
        });
        $[43] = Colors.textMuted;
        $[44] = t16;
      } else {
        t16 = $[44];
      }
      let t17;
      if ($[45] !== dismissAchievementReport || $[46] !== t16) {
        t17 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Pressable.default, {
          onPress: dismissAchievementReport,
          children: t16
        });
        $[45] = dismissAchievementReport;
        $[46] = t16;
        $[47] = t17;
      } else {
        t17 = $[47];
      }
      if ($[48] !== styles.header || $[49] !== t13 || $[50] !== t15 || $[51] !== t17) {
        t4 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
          style: styles.header,
          children: [t13, t15, t17]
        });
        $[48] = styles.header;
        $[49] = t13;
        $[50] = t15;
        $[51] = t17;
        $[52] = t4;
      } else {
        t4 = $[52];
      }
      T0 = ScrollView.default;
      t0 = styles.list;
      if ($[53] === Symbol.for("react.memo_cache_sentinel")) {
        t1 = {
          paddingBottom: 8
        };
        $[53] = t1;
      } else {
        t1 = $[53];
      }
      let t18;
      if ($[54] !== Colors.warning || $[55] !== styles.achDesc || $[56] !== styles.achIcon || $[57] !== styles.achInfo || $[58] !== styles.achName || $[59] !== styles.achRow) {
        t18 = ach => /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
          style: styles.achRow,
          children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(View.default, {
            style: styles.achIcon,
            children: /*#__PURE__*/(0, _reactJsxRuntime.jsx)(_expoVectorIcons.Feather, {
              name: "star",
              size: 14,
              color: Colors.warning
            })
          }), /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(View.default, {
            style: styles.achInfo,
            children: [/*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
              style: styles.achName,
              children: ach.title
            }), /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
              style: styles.achDesc,
              children: ach.description
            })]
          })]
        }, ach.id);
        $[54] = Colors.warning;
        $[55] = styles.achDesc;
        $[56] = styles.achIcon;
        $[57] = styles.achInfo;
        $[58] = styles.achName;
        $[59] = styles.achRow;
        $[60] = t18;
      } else {
        t18 = $[60];
      }
      t2 = achDefs.map(t18);
      $[0] = Colors.textMuted;
      $[1] = Colors.warning;
      $[2] = dismissAchievementReport;
      $[3] = pendingAchievements;
      $[4] = styles.achDesc;
      $[5] = styles.achIcon;
      $[6] = styles.achInfo;
      $[7] = styles.achName;
      $[8] = styles.achRow;
      $[9] = styles.container;
      $[10] = styles.header;
      $[11] = styles.headerIcon;
      $[12] = styles.list;
      $[13] = styles.overlay;
      $[14] = styles.title;
      $[15] = topInset;
      $[16] = T0;
      $[17] = T1;
      $[18] = T2;
      $[19] = T3;
      $[20] = t0;
      $[21] = t1;
      $[22] = t2;
      $[23] = t3;
      $[24] = t4;
      $[25] = t5;
      $[26] = t6;
      $[27] = t7;
      $[28] = t8;
      $[29] = t9;
    } else {
      T0 = $[16];
      T1 = $[17];
      T2 = $[18];
      T3 = $[19];
      t0 = $[20];
      t1 = $[21];
      t2 = $[22];
      t3 = $[23];
      t4 = $[24];
      t5 = $[25];
      t6 = $[26];
      t7 = $[27];
      t8 = $[28];
      t9 = $[29];
    }
    let t10;
    if ($[61] !== T0 || $[62] !== t0 || $[63] !== t1 || $[64] !== t2) {
      t10 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(T0, {
        style: t0,
        contentContainerStyle: t1,
        children: t2
      });
      $[61] = T0;
      $[62] = t0;
      $[63] = t1;
      $[64] = t2;
      $[65] = t10;
    } else {
      t10 = $[65];
    }
    let t11;
    if ($[66] !== styles.dismissText) {
      t11 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Text.default, {
        style: styles.dismissText,
        children: "ACKNOWLEDGED"
      });
      $[66] = styles.dismissText;
      $[67] = t11;
    } else {
      t11 = $[67];
    }
    let t12;
    if ($[68] !== dismissAchievementReport || $[69] !== styles.dismissBtn || $[70] !== t11) {
      t12 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(Pressable.default, {
        style: styles.dismissBtn,
        onPress: dismissAchievementReport,
        children: t11
      });
      $[68] = dismissAchievementReport;
      $[69] = styles.dismissBtn;
      $[70] = t11;
      $[71] = t12;
    } else {
      t12 = $[71];
    }
    let t13;
    if ($[72] !== T1 || $[73] !== t10 || $[74] !== t12 || $[75] !== t3 || $[76] !== t4) {
      t13 = /*#__PURE__*/(0, _reactJsxRuntime.jsxs)(T1, {
        style: t3,
        children: [t4, t10, t12]
      });
      $[72] = T1;
      $[73] = t10;
      $[74] = t12;
      $[75] = t3;
      $[76] = t4;
      $[77] = t13;
    } else {
      t13 = $[77];
    }
    let t14;
    if ($[78] !== T2 || $[79] !== t13 || $[80] !== t5) {
      t14 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(T2, {
        style: t5,
        children: t13
      });
      $[78] = T2;
      $[79] = t13;
      $[80] = t5;
      $[81] = t14;
    } else {
      t14 = $[81];
    }
    let t15;
    if ($[82] !== T3 || $[83] !== t14 || $[84] !== t6 || $[85] !== t7 || $[86] !== t8 || $[87] !== t9) {
      t15 = /*#__PURE__*/(0, _reactJsxRuntime.jsx)(T3, {
        visible: t6,
        animationType: t7,
        transparent: t8,
        onRequestClose: t9,
        children: t14
      });
      $[82] = T3;
      $[83] = t14;
      $[84] = t6;
      $[85] = t7;
      $[86] = t8;
      $[87] = t9;
      $[88] = t15;
    } else {
      t15 = $[88];
    }
    return t15;
  }
  function _temp(id) {
    return _engineAchievements.ACHIEVEMENTS_MAP[id];
  }
  const useStyles = (0, _hooksUseThemedStyles.makeThemedStyles)(Colors => StyleSheet.default.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.85)",
      justifyContent: "flex-start",
      alignItems: "center",
      padding: 20
    },
    container: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: Colors.bgSecondary,
      borderWidth: 1,
      borderColor: Colors.warning + "60",
      borderRadius: 8,
      padding: 16
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
      gap: 8
    },
    headerIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: Colors.warning + "20",
      justifyContent: "center",
      alignItems: "center"
    },
    title: {
      flex: 1,
      color: Colors.warning,
      fontFamily: "Inter_700Bold",
      fontSize: 14,
      letterSpacing: 2
    },
    list: {
      maxHeight: 300
    },
    achRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border
    },
    achIcon: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: Colors.warning + "15",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 2
    },
    achInfo: {
      flex: 1
    },
    achName: {
      color: Colors.accent,
      fontFamily: "Inter_700Bold",
      fontSize: 12,
      letterSpacing: 1,
      marginBottom: 2
    },
    achDesc: {
      color: Colors.textSecondary,
      fontFamily: "Inter_400Regular",
      fontSize: 11
    },
    dismissBtn: {
      marginTop: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: Colors.warning + "40",
      borderRadius: 6,
      backgroundColor: Colors.warning + "10",
      alignItems: "center"
    },
    dismissText: {
      color: Colors.warning,
      fontFamily: "Inter_700Bold",
      fontSize: 12,
      letterSpacing: 2
    }
  }));
},1873,[11,723,13,480,126,365,282,148,135,274,377,798,993,863,883,6]);