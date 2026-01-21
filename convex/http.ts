import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// TikTok URL prefix verification file
// This allows TikTok to verify we own this domain for PULL_FROM_URL
http.route({
  path: "/tiktokm9mCu2HxIOt2lrIRTfjBWOdeiXnYdRNi.txt",
  method: "GET",
  handler: httpAction(async () => {
    // TikTok expects this exact content for verification
    return new Response("tiktok-developers-site-verification=m9mCu2HxIOt2lrIRTfjBWOdeiXnYdRNi", {
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }),
});

// Image proxy endpoint for TikTok posting
// TikTok requires images to be served from a verified domain
// This proxy also converts PNG images to WebP since TikTok doesn't accept PNG
http.route({
  pathPrefix: "/images/",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    // Extract the storage path ID (UUID) from the URL path
    const url = new URL(request.url);
    const storagePathId = url.pathname.replace("/images/", "");

    if (!storagePathId) {
      return new Response("Missing storage path ID", { status: 400 });
    }

    try {
      // Construct the Convex cloud storage URL
      // CONVEX_SITE_URL is like https://xxx.convex.site, we need https://xxx.convex.cloud
      const siteUrl = process.env.CONVEX_SITE_URL || "";
      const cloudUrl = siteUrl.replace(".convex.site", ".convex.cloud");
      const convexCloudUrl = `${cloudUrl}/api/storage/${storagePathId}`;

      const response = await fetch(convexCloudUrl);

      if (!response.ok) {
        console.error("Failed to fetch from Convex storage:", response.status);
        return new Response("Image not found", { status: 404 });
      }

      const contentType = response.headers.get("Content-Type") || "image/png";

      // If the image is PNG, convert to WebP using wsrv.nl (free image CDN)
      // TikTok Photo Post only accepts JPEG/WebP, not PNG
      if (contentType === "image/png") {
        console.log("Converting PNG to WebP via wsrv.nl for TikTok compatibility");

        // Use wsrv.nl to convert PNG to WebP on the fly
        // wsrv.nl accepts URL parameter and can output different formats
        const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(convexCloudUrl)}&output=webp&q=90`;

        const webpResponse = await fetch(wsrvUrl);

        if (webpResponse.ok) {
          const webpData = await webpResponse.arrayBuffer();
          console.log("Successfully converted to WebP, size:", webpData.byteLength);

          return new Response(webpData, {
            headers: {
              "Content-Type": "image/webp",
              "Cache-Control": "public, max-age=31536000",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } else {
          console.error("wsrv.nl conversion failed:", webpResponse.status);
          // Fall through to serve original PNG
        }
      }

      // Serve non-PNG images (or PNG if conversion failed) as-is
      const imageData = await response.arrayBuffer();

      return new Response(imageData, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      console.error("Error serving image:", err);
      return new Response("Failed to serve image", { status: 500 });
    }
  }),
});

// TikTok OAuth callback endpoint
http.route({
  path: "/auth/tiktok/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    // Get the frontend URL from environment
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    // Handle errors from TikTok
    if (error) {
      console.error("TikTok OAuth error:", error, errorDescription);
      return Response.redirect(
        `${frontendUrl}/settings?error=${encodeURIComponent(errorDescription || error)}&tab=account`
      );
    }

    if (!code || !state) {
      return Response.redirect(
        `${frontendUrl}/settings?error=${encodeURIComponent("Missing code or state")}&tab=account`
      );
    }

    // Validate the state
    const stateData = await ctx.runMutation(internal.accounts.validateOAuthState, {
      state,
    });

    if (!stateData) {
      return Response.redirect(
        `${frontendUrl}/settings?error=${encodeURIComponent("Invalid or expired state")}&tab=account`
      );
    }

    try {
      // Exchange code for access token
      const clientKey = process.env.TIKTOK_CLIENT_KEY;
      const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

      if (!clientKey || !clientSecret) {
        throw new Error("TikTok credentials not configured");
      }

      const tokenResponse = await fetch(
        "https://open.tiktokapis.com/v2/oauth/token/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri: `${process.env.CONVEX_SITE_URL}/auth/tiktok/callback`,
          }),
        }
      );

      const tokenData = await tokenResponse.json();

      if (tokenData.error || !tokenData.access_token) {
        console.error("TikTok token exchange error:", tokenData);
        throw new Error(tokenData.error_description || "Failed to get access token");
      }

      // Get user info from TikTok (basic + profile + stats)
      const userResponse = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username,follower_count,following_count,likes_count,video_count",
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        }
      );

      const userData = await userResponse.json();

      if (userData.error?.code !== "ok" && userData.error) {
        console.error("TikTok user info error:", userData);
        throw new Error("Failed to get user info");
      }

      const userInfo = userData.data?.user || {};

      // Store the account with stats
      await ctx.runMutation(internal.accounts.storeAccount, {
        userId: stateData.userId,
        platform: "tiktok",
        username: userInfo.username || userInfo.display_name || "Unknown",
        displayName: userInfo.display_name,
        avatarUrl: userInfo.avatar_url,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt: tokenData.expires_in
          ? Date.now() + tokenData.expires_in * 1000
          : undefined,
        platformUserId: tokenData.open_id || userInfo.open_id,
        scopes: tokenData.scope ? tokenData.scope.split(",") : undefined,
        // Account-level stats from user.info.stats scope
        followerCount: userInfo.follower_count,
        followingCount: userInfo.following_count,
        likesCount: userInfo.likes_count,
        videoCount: userInfo.video_count,
      });

      // Redirect back to settings with success
      return Response.redirect(
        `${frontendUrl}/settings?success=tiktok_connected&tab=account`
      );
    } catch (err) {
      console.error("TikTok OAuth callback error:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return Response.redirect(
        `${frontendUrl}/settings?error=${encodeURIComponent(errorMessage)}&tab=account`
      );
    }
  }),
});

export default http;
