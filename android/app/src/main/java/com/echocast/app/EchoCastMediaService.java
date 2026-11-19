package com.echocast.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * EchoCastMediaService
 *
 * Keeps Android CPU, Wi-Fi radio, and audio pipelines active when the screen
 * is locked or the app is minimized during synchronized multi-device playback.
 */
public class EchoCastMediaService extends Service {
    private static final String CHANNEL_ID = "echocast_audio_stream";
    private static final int NOTIFICATION_ID = 4040;

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    @Override
    public void onCreate() {
        super.onCreate();

        // 1. Acquire partial wake lock to prevent CPU sleep during synchronization intervals
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "EchoCast::PlaybackWakeLock"
            );
            wakeLock.acquire();
        }

        // 2. Acquire high-performance Wi-Fi lock to eliminate packet jitter on local network
        WifiManager wifiManager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifiManager != null) {
            int lockMode = WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                lockMode = WifiManager.WIFI_MODE_FULL_LOW_LATENCY;
            }
            wifiLock = wifiManager.createWifiLock(lockMode, "EchoCast::WifiLowLatencyLock");
            wifiLock.acquire();
        }

        // 3. Start Foreground Service with notification
        createNotificationChannel();
        Notification notification = buildForegroundNotification("EchoCast Active", "Streaming synchronized audio on local network");
        startForeground(NOTIFICATION_ID, notification);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "EchoCast Audio Streaming",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Maintains low-latency network connection for multi-device synchronized audio");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildForegroundNotification(String title, String text) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        return builder
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            wifiLock.release();
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
