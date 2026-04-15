package com.hajajhairdesign.booking;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onStart() {
        super.onStart();
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
