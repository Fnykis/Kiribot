function renderStandaloneRefusal() {
    document.body.replaceChildren();
    const p = document.createElement('p');
    p.style.cssText = 'padding:2rem;font-family:sans-serif;';
    p.textContent = 'Open this app inside Discord.';
    document.body.appendChild(p);
}

export async function bootSdk(DiscordSDKClass, clientId) {
    let sdk;
    try {
        sdk = new DiscordSDKClass(clientId);
        await sdk.ready();
    } catch {
        renderStandaloneRefusal();
        throw new Error('not_in_discord');
    }

    const { code } = await sdk.commands.authorize({
        client_id: clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'guilds.members.read'],
    });

    return { sdk, code };
}

export async function authenticateSdk(sdk, accessToken) {
    return sdk.commands.authenticate({ access_token: accessToken });
}
