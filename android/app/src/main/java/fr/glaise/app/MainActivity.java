package fr.glaise.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Glaise pour Android : se connecte au serveur d'un ami (Glaise.exe ou node server.js)
 * et affiche le jeu en plein écran, commandes tactiles activées.
 */
public class MainActivity extends Activity {
    private static final int BG = 0xFF0E110F, PANEL = 0xFF1A1E1B, LINE = 0x40E4DDCA;
    private static final int TEXT = 0xFFE4DDCA, MUTED = 0xFF9A958A, ACCENT = 0xFFE0A23A, DANGER = 0xFFE0766A;

    private FrameLayout root;
    private WebView web;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        WebView.setWebContentsDebuggingEnabled(true);
        prefs = getSharedPreferences("glaise", Context.MODE_PRIVATE);
        root = new FrameLayout(this);
        root.setBackgroundColor(BG);
        setContentView(root);
        hideSystemUi();
        String url = prefs.getString("url", "");
        if (!url.isEmpty() && prefs.getBoolean("auto", true)) openGame(url);
        else showForm(null);
    }

    // ------------------------------------------------------------ écran de connexion
    private void showForm(String error) {
        destroyWeb();
        root.removeAllViews();
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_VERTICAL);
        col.setPadding(dp(40), dp(18), dp(40), dp(18));

        TextView title = text("GLAISE", 38, TEXT, true);
        title.setLetterSpacing(0.16f);
        TextView sub = text("ZONE D'EXCLUSION · EXTRACTION", 11, ACCENT, true);
        sub.setLetterSpacing(0.25f);
        TextView label = text("ADRESSE DU SERVEUR", 11, MUTED, true);
        label.setLetterSpacing(0.1f);

        final EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        input.setHint("http://192.168.1.20:8080");
        input.setText(prefs.getString("url", ""));
        input.setTextColor(TEXT);
        input.setHintTextColor(0xFF5F5B53);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        input.setBackground(box(PANEL, LINE));
        input.setPadding(dp(12), dp(10), dp(12), dp(10));

        Button go = new Button(this);
        go.setText("REJOINDRE");
        go.setTextColor(0xFF17130B);
        go.setTypeface(Typeface.DEFAULT_BOLD);
        go.setLetterSpacing(0.08f);
        go.setBackground(box(ACCENT, ACCENT));

        TextView help = text("Lancez le serveur sur un PC (Glaise.exe), puis entrez l'adresse affichée dans sa fenêtre.\n"
                + "Même Wi-Fi : adresse IPv4, par exemple http://192.168.1.20:8080\n"
                + "Par Internet : adresse IPv6 entre crochets, par exemple http://[2a01:e0a:…]:8080", 12, MUTED, false);
        help.setLineSpacing(0, 1.2f);

        col.addView(title);
        col.addView(sub, margins(0, 4, 0, 18));
        if (error != null) {
            TextView err = text(error, 13, DANGER, false);
            col.addView(err, margins(0, 0, 0, 12));
        }
        col.addView(label, margins(0, 0, 0, 6));
        col.addView(input, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        col.addView(go, margins(0, 12, 0, 14));
        col.addView(help);
        scroll.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        final Runnable connect = () -> {
            String u = normalize(input.getText().toString());
            if (u == null) { input.setError("Adresse invalide"); return; }
            prefs.edit().putString("url", u).putBoolean("auto", true).apply();
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.hideSoftInputFromWindow(input.getWindowToken(), 0);
            openGame(u);
        };
        go.setOnClickListener(v -> connect.run());
        input.setOnEditorActionListener((v, actionId, event) -> { connect.run(); return true; });
    }

    // Ajoute http:// si besoin, vérifie qu'il y a bien un hôte, termine par /
    private static String normalize(String s) {
        s = s.trim();
        if (s.isEmpty()) return null;
        if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://" + s;
        Uri u = Uri.parse(s);
        if (u.getHost() == null || u.getHost().isEmpty()) return null;
        if (!s.endsWith("/")) s += "/";
        return s;
    }

    // ------------------------------------------------------------ jeu
    private void openGame(String url) {
        destroyWeb();
        root.removeAllViews();
        hideSystemUi();
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);   // toujours la version du serveur
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) {
                    final String msg = "Serveur injoignable (" + err.getDescription() + "). Vérifiez qu'il est lancé et que l'adresse est la bonne.";
                    root.post(() -> showForm(msg));
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return false;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.loadUrl(url + (url.contains("?") ? "&" : "?") + "tactile=1");
    }

    private void destroyWeb() {
        if (web == null) return;
        root.removeView(web);
        web.stopLoading();
        web.destroy();
        web = null;
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        new AlertDialog.Builder(this)
                .setTitle("Glaise")
                .setMessage("Quitter la partie ?")
                .setPositiveButton("Quitter", (d, w) -> finish())
                .setNeutralButton("Changer de serveur", (d, w) -> {
                    prefs.edit().putBoolean("auto", false).apply();
                    showForm(null);
                })
                .setNegativeButton("Annuler", null)
                .show();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        destroyWeb();
        super.onDestroy();
    }

    // ------------------------------------------------------------ plein écran immersif
    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    // ------------------------------------------------------------ petits utilitaires d'interface
    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private GradientDrawable box(int fill, int stroke) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setStroke(dp(1), stroke);
        g.setCornerRadius(dp(3));
        return g;
    }

    private LinearLayout.LayoutParams margins(int l, int t, int r, int b) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(dp(l), dp(t), dp(r), dp(b));
        return p;
    }
}
