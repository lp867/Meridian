package io.github.lp867.meridian;

import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;

/** Startet Meridian als Trusted Web Activity (Chrome ohne Adressleiste). */
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Hochformat schon fürs Startbild. Unter Android 8.0 stürzt das wegen des
        // durchsichtigen Hintergrunds ab, dort übernimmt Chrome die Ausrichtung.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }
}
