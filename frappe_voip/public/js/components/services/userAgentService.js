// Service to manage SIP and user agent sessions
// Ensure the 'voip' namespace exists
frappe.provide('voip');

// Define the UserAgent class
voip.UserAgent = class UserAgent {
    constructor() {
        // Initialize properties
        this.attemptingToReconnect = false;
        this.demoTimeout = null;
        this.preferredInputDevice = null;
        this.registerer = null;
        this.remoteAudio = new window.Audio();
        this.session = null;
        this.transferTarget = null;
        this.voip = voip.instance; // Assuming you have a voip instance
        this.softphone = this.voip.softphone;

        // Initialize services
        this.callService = voip.callService;
        this.notificationService = frappe; // Use frappe's notification methods
        this.ringtoneService = voip.ringtoneService;

        // Initialize UserAgent
        this.init();
    }

    get mediaConstraints() {
        const constraints = { audio: true, video: false };
        if (this.preferredInputDevice) {
            constraints.audio = { deviceId: { exact: this.preferredInputDevice } };
        }
        return constraints;
    }

    get mediaStreamFactory() {
        return (constraints, sessionDescriptionHandler) => {
            const mediaRequest = navigator.mediaDevices.getUserMedia(constraints);
            mediaRequest.then(
                (stream) => this._onGetUserMediaSuccess(stream),
                (error) => this._onGetUserMediaFailure(error)
            );
            return mediaRequest;
        };
    }

    get sessionDelegate() {
        return { onBye: (bye) => this._onBye(bye) };
    }

    get sipJsUserAgentConfig() {
        const isDebug = frappe.boot.developer_mode;
        return {
            authorizationPassword: this.voip.settings.voip_secret,
            authorizationUsername: this.voip.authorizationUsername,
            delegate: {
                onDisconnect: (error) => this._onTransportDisconnected(error),
                onInvite: (inviteSession) => this._onIncomingInvitation(inviteSession),
            },
            hackIpInContact: true,
            logBuiltinEnabled: isDebug,
            logLevel: isDebug ? "debug" : "error",
            sessionDescriptionHandlerFactory: SIP.Web.defaultSessionDescriptionHandlerFactory(
                this.mediaStreamFactory
            ),
            sessionDescriptionHandlerFactoryOptions: { iceGatheringTimeout: 1000 },
            transportOptions: {
                server: this.voip.webSocketUrl,
                traceSip: isDebug,
            },
            uri: SIP.UserAgent.makeURI(
                `sip:${this.voip.settings.voip_username}@${this.voip.pbxAddress}`
            ),
            userAgentString: `Frappe ${frappe.boot.version} SIP.js/${window.SIP.version}`,
        };
    }

    async acceptIncomingCall() {
        this.ringtoneService.stopPlaying();
        this.session.sipSession.accept({
            sessionDescriptionHandlerOptions: {
                constraints: this.mediaConstraints,
            },
        });
        this.voip.triggerError(__("Please accept the use of the microphone."));
    }

    async attemptReconnection(attemptCount = 0) {
        if (attemptCount > 5) {
            this.voip.triggerError(
                __("The WebSocket connection was lost and couldn't be reestablished.")
            );
            return;
        }
        if (this.attemptingToReconnect) {
            return;
        }
        this.attemptingToReconnect = true;
        try {
            await this.__sipJsUserAgent.reconnect();
            this.registerer.register();
            this.voip.resolveError();
        } catch {
            setTimeout(
                () => this.attemptReconnection(attemptCount + 1),
                2 ** attemptCount * 1000 + Math.random() * 500
            );
        } finally {
            this.attemptingToReconnect = false;
        }
    }

    getUri(phoneNumber) {
        const sanitizedNumber = this.cleanPhoneNumber(phoneNumber);
        return SIP.UserAgent.makeURI(`sip:${sanitizedNumber}@${this.voip.pbxAddress}`);
    }

    cleanPhoneNumber(phoneNumber) {
        // Implement phone number cleaning logic
        return phoneNumber.replace(/[^\d]/g, '');
    }

    async hangup({ activityDone = true } = {}) {
        this.ringtoneService.stopPlaying();
        clearTimeout(this.demoTimeout);
        if (this.session.sipSession) {
            this._cleanUpRemoteAudio();
            switch (this.session.sipSession.state) {
                case SIP.SessionState.Establishing:
                    this.session.sipSession.cancel();
                    break;
                case SIP.SessionState.Established:
                    this.session.sipSession.bye();
                    break;
            }
        }
        switch (this.session.call.state) {
            case "calling":
                await this.callService.abort(this.session.call);
                break;
            case "ongoing":
                await this.callService.end(this.session.call, { activityDone });
                break;
        }
        this.session = null;
        if (this.softphone.isInAutoCallMode) {
            this.softphone.selectNextActivity();
        }
    }

    async init() {
        if (this.voip.mode !== "prod") {
            return;
        }
        if (!this.voip.hasRtcSupport) {
            this.voip.triggerError(
                __("Your browser does not support some of the features required for VoIP to work. Please try updating your browser or using a different one.")
            );
            return;
        }
        if (!this.voip.isServerConfigured) {
            this.voip.triggerError(
                __("PBX or Websocket address is missing. Please check your settings.")
            );
            return;
        }
        if (!this.voip.areCredentialsSet) {
            this.voip.triggerError(
                __("Your login details are not set correctly. Please contact your administrator.")
            );
            return;
        }
        try {
            // Load SIP.js library if necessary
            // Assuming SIP.js is already loaded
        } catch (error) {
            console.error(error);
            this.voip.triggerError(
                __("Failed to load the SIP.js library:\n\n%(error)s", {
                    error: error.message,
                })
            );
            return;
        }
        try {
            this.__sipJsUserAgent = new SIP.UserAgent(this.sipJsUserAgentConfig);
        } catch (error) {
            console.error(error);
            this.voip.triggerError(
                __("An error occurred during the instantiation of the User Agent:\n\n%(error)s", {
                    error: error.message,
                })
            );
            return;
        }
        this.voip.triggerError(__("Connecting…"));
        try {
            await this.__sipJsUserAgent.start();
        } catch {
            this.voip.triggerError(
                __("The user agent could not be started. The websocket server URL may be incorrect. Please have an administrator check the websocket server URL in the General Settings.")
            );
            return;
        }
        this.registerer = new voip.Registerer(this.voip, this.__sipJsUserAgent);
        this.registerer.register();
    }

    invite(phoneNumber) {
        let calleeUri;
        if (this.voip.willCallFromAnotherDevice) {
            calleeUri = this.getUri(this.voip.settings.external_device_number);
            this.session.transferTarget = phoneNumber;
        } else {
            calleeUri = this.getUri(phoneNumber);
        }
        try {
            const inviter = new SIP.Inviter(this.__sipJsUserAgent, calleeUri);
            inviter.delegate = this.sessionDelegate;
            inviter.stateChange.addListener((state) => this._onSessionStateChange(state));
            this.session.sipSession = inviter;
            this.session.sipSession.invite({
                requestDelegate: {
                    onAccept: (response) => this._onOutgoingInvitationAccepted(response),
                    onProgress: (response) => this._onOutgoingInvitationProgress(response),
                    onReject: (response) => this._onOutgoingInvitationRejected(response),
                },
                sessionDescriptionHandlerOptions: {
                    constraints: this.mediaConstraints,
                },
            }).catch((error) => {
                if (error.name === "NotAllowedError") {
                    return;
                }
                throw error;
            });
        } catch (error) {
            console.error(error);
            this.voip.triggerError(
                __("An error occurred trying to invite the following number: %(phoneNumber)s\n\nError: %(error)s", { phoneNumber, error: error.message })
            );
        }
    }

    async makeCall(data) {
        if (!(await this.voip.willCallUsingVoip())) {
            window.location.assign(`tel:${data.phone_number}`);
            return;
        }
        const call = await this.callService.create(data);
        this.softphone.show();
        this.softphone.closeNumpad();
        frappe.show_alert({
            message: __("Calling %(phone_number)s", { phone_number: call.phoneNumber }),
            indicator: 'blue'
        });
        this.softphone.selectCorrespondence({ call });
        this.session = {
            inviteState: "trying",
            isMute: false,
            call,
        };
        this.ringtoneService.ringback.play();
        if (this.voip.mode === "prod") {
            this.invite(call.phoneNumber);
        } else {
            this.demoTimeout = setTimeout(() => {
                this._onOutgoingInvitationAccepted();
            }, 3000);
        }
    }

    async rejectIncomingCall() {
        this.ringtoneService.stopPlaying();
        this.session.sipSession.reject({ statusCode: 603 /* Decline */ });
        await this.callService.reject(this.session.call);
        this.session = null;
    }

    async switchInputStream(deviceId) {
        if (!this.session.sipSession?.sessionDescriptionHandler?.peerConnection) {
            return;
        }
        this.preferredInputDevice = deviceId;
        const stream = await navigator.mediaDevices.getUserMedia(this.mediaConstraints);
        for (const sender of this.session.sipSession.sessionDescriptionHandler.peerConnection.getSenders()) {
            if (sender.track) {
                await sender.replaceTrack(stream.getAudioTracks()[0]);
            }
        }
    }

    transfer(number) {
        if (this.voip.mode === "demo") {
            this.hangup();
            return;
        }
        const transferTarget = this.getUri(number);
        this.session.sipSession.refer(transferTarget, {
            requestDelegate: {
                onAccept: (response) => this._onReferAccepted(response),
            },
        });
    }

    updateSenderTracks() {
        if (!this.session?.sipSession?.sessionDescriptionHandler) {
            return;
        }
        const { peerConnection } = this.session.sipSession.sessionDescriptionHandler;
        for (const { track } of peerConnection.getSenders()) {
            if (track) {
                track.enabled = !this.session.isMute;
            }
        }
    }

    _cleanUpRemoteAudio() {
        this.remoteAudio.srcObject = null;
        this.remoteAudio.pause();
    }

    async _onBye(bye) {
        if (!this.session) {
            return;
        }
        await this.callService.end(this.session.call);
        this.session = null;
        this._cleanUpRemoteAudio();
        if (this.softphone.isInAutoCallMode) {
            this.softphone.selectNextActivity();
        }
    }

    _onGetUserMediaFailure(error) {
        console.error(error);
        const errorMessage = (() => {
            switch (error.name) {
                case "NotAllowedError":
                    return __("Cannot access audio recording device. If you have denied access to your microphone, please allow it and try again. Otherwise, make sure that this website is running over HTTPS and that your browser is not set to deny access to media devices.");
                case "NotFoundError":
                    return __("No audio recording device available. The application requires a microphone in order to be used.");
                case "NotReadableError":
                    return __("A hardware error has occurred while trying to access the audio recording device. Please ensure that your drivers are up to date and try again.");
                default:
                    return __("An error occurred involving the audio recording device (%(errorName)s):\n%(errorMessage)s", {
                        errorMessage: error.message,
                        errorName: error.name
                    });
            }
        })();
        this.voip.triggerError(errorMessage, { isNonBlocking: true });
        if (this.session.call.direction === "outgoing") {
            this.hangup();
        } else {
            this.rejectIncomingCall();
        }
    }

    _onGetUserMediaSuccess(stream) {
        this.voip.resolveError();
        switch (this.session.call.direction) {
            case "outgoing":
                this.ringtoneService.dial.play();
                break;
            case "incoming":
                this.callService.start(this.session.call);
                break;
        }
    }

    async _onIncomingInvitation(inviteSession) {
        if (this.session) {
            inviteSession.reject({ statusCode: 486 /* Busy Here */ });
            return;
        }
        if (this.voip.settings.should_auto_reject_incoming_calls) {
            inviteSession.reject({ statusCode: 488 /* Not Acceptable Here */ });
            return;
        }
        const phoneNumber = inviteSession.remoteIdentity.uri.user;
        const call = await this.callService.create({
            direction: "incoming",
            phone_number: phoneNumber,
            state: "calling",
        });
        this.softphone.selectCorrespondence({ call });
        inviteSession.delegate = this.sessionDelegate;
        inviteSession.incomingInviteRequest.delegate = {
            onCancel: (message) => this._onIncomingInvitationCanceled(message),
        };
        inviteSession.stateChange.addListener((state) => this._onSessionStateChange(state));
        this.session = {
            call,
            isMute: false,
            sipSession: inviteSession,
        };
        this.softphone.show();
        this.ringtoneService.incoming.play();
        // TODO: Implement notification logic if needed
    }

    _onIncomingInvitationCanceled(message) {
        this.ringtoneService.stopPlaying();
        this.session.sipSession.reject({ statusCode: 487 /* Request Terminated */ });
        this.callService.miss(this.session.call);
        this.session = null;
    }

    _onOutgoingInvitationAccepted(response) {
        this.ringtoneService.stopPlaying();
        this.session.inviteState = "ok";
        if (this.voip.willCallFromAnotherDevice) {
            this.transfer(this.session.transferTarget);
            return;
        }
        this.callService.start(this.session.call);
    }

    _onOutgoingInvitationProgress(response) {
        const { statusCode } = response.message;
        if (statusCode === 183 /* Session Progress */ || statusCode === 180 /* Ringing */) {
            this.ringtoneService.ringback.play();
            this.session.inviteState = "ringing";
        }
    }

    _onOutgoingInvitationRejected(response) {
        this.ringtoneService.stopPlaying();
        if (response.message.statusCode === 487) { // Request Terminated
            // Invitation has been cancelled by the user, the session has already been terminated
            return;
        }
        const errorMessage = (() => {
            switch (response.message.statusCode) {
                case 404: // Not Found
                case 488: // Not Acceptable Here
                case 603: // Decline
                    return __("The number is incorrect, the user credentials could be wrong, or the connection cannot be made. Please check your configuration.\n(Reason received: %(reasonPhrase)s)", { reasonPhrase: response.message.reasonPhrase });
                case 486: // Busy Here
                case 600: // Busy Everywhere
                    return __("The person you are trying to contact is currently unavailable.");
                default:
                    return __("Call rejected (reason: “%(reasonPhrase)s”)", {
                        reasonPhrase: response.message.reasonPhrase,
                    });
            }
        })();
        this.voip.triggerError(errorMessage, { isNonBlocking: true });
        this.callService.reject(this.session.call);
        this.session = null;
    }

    _onReferAccepted(response) {
        this.session.sipSession.bye();
        this._cleanUpRemoteAudio();
        this.callService.end(this.session.call);
        this.session = null;
    }

    _onSessionStateChange(newState) {
        switch (newState) {
            case SIP.SessionState.Initial:
                break;
            case SIP.SessionState.Establishing:
                break;
            case SIP.SessionState.Established:
                this._setUpRemoteAudio();
                this.session.sipSession.sessionDescriptionHandler.remoteMediaStream.onaddtrack = (
                    mediaStreamTrackEvent
                ) => this._setUpRemoteAudio();
                break;
            case SIP.SessionState.Terminating:
                break;
            case SIP.SessionState.Terminated:
                break;
            default:
                throw new Error(`Unknown session state: "${newState}".`);
        }
    }

    _onTransportDisconnected(error) {
        if (!error) {
            return;
        }
        console.error(error);
        this.voip.triggerError(
            __("The WebSocket connection to the server has been lost. Attempting to reestablish the connection…")
        );
        this.attemptReconnection();
    }

    _setUpRemoteAudio() {
        const remoteStream = new MediaStream();
        for (const receiver of this.session.sipSession.sessionDescriptionHandler.peerConnection.getReceivers()) {
            if (receiver.track) {
                remoteStream.addTrack(receiver.track);
                // According to the SIP.js documentation, this is needed by Safari to work.
                this.remoteAudio.load();
            }
        }
        this.remoteAudio.srcObject = remoteStream;
        this.remoteAudio.play();
    }
};

// Initialize and attach the UserAgent service
voip.userAgentService = new voip.UserAgent();
