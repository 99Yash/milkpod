# Ably Documentation

> Ably is a realtime experience infrastructure platform that provides pub/sub messaging, chat, realtime data synchronization, and more.

- **Global Edge Network**: Ultra-low latency realtime messaging delivered through a globally distributed edge network
- **Enterprise Scale**: Built to handle millions of concurrent connections with guaranteed message delivery
- **Multiple Products**: Pub/Sub, Chat, LiveSync, LiveObjects and Spaces
- **Developer-Friendly SDKs**: SDKs available for JavaScript, Node.js, Java, Python, Go, Objective-C, Swift, Csharp, PHP, Flutter, Ruby, React, React Native, and Kotlin

## Platform

- [About Ably](https://ably.com/docs/platform.md): An introduction to Ably and its highly-available, scalable platform.
- [Guide: Building livestream chat at scale with Ably](https://ably.com/docs/guides/chat/build-livestream.md): Architecting livestream chat with Ably: performance, reliability, and cost at scale. Key decisions, technical depth, and why Ably is the right choice.
- [Guide: Data streaming and distribution with Ably](https://ably.com/docs/guides/pub-sub/data-streaming.md): Optimize data streaming at scale with Ably: reduce bandwidth with Deltas, manage bursts with server-side batching, ensure freshness with Conflation.
- [Guide: Export chat data to your own systems](https://ably.com/docs/guides/chat/export-chat.md): Learn how to export chat data from Ably Chat to your own systems.
- [Building with LLMs](https://ably.com/docs/platform/ai-llms.md): Learn how to use LLMs to build with Ably documentation. Access markdown versions of docs and use our LLM-optimized resources.
- [llms.txt](https://ably.com/docs/platform/ai-llms/llms-txt.md): Discover all Ably documentation pages using llms.txt, a machine-readable index optimized for LLMs and AI assistants.
- [Support tickets](https://ably.com/docs/platform/support.md): Learn more about Ably's AI Transport and the features that enable you to quickly build functionality into new and existing applications.
- [Ably CLI](https://ably.com/docs/platform/tools/cli.md): The Ably CLI is a command-line interface for managing Ably resources and interacting with Ably's products APIs directly from your terminal.

### Account Management

- [Two-factor authentication \(2FA\)](https://ably.com/docs/platform/account/2fa.md): Enable two-factor authentication for your Ably account.
- [Enterprise customization](https://ably.com/docs/platform/account/enterprise-customization.md): How Enterprise customers can create a custom endpoint and benefit from Active Traffic Management and other advanced Ably features.
- [Organizations](https://ably.com/docs/platform/account/organizations.md): Manage Ably organizations, provision users, configure SSO with SCIM, and handle account roles.
- [Account overview](https://ably.com/docs/platform/account.md): Manage all aspects of your account, from 2FA and billing to user management and personal preferences.
- [Programmatic management with Control API](https://ably.com/docs/platform/account/control-api.md): The Control API is a REST API that enables you to manage your Ably account programmatically. This is the Control API user guide.
- [Single sign-on \(SSO\)](https://ably.com/docs/platform/account/sso.md): Single sign-on enables users to authenticate with Ably using your own identity provider.
- [User management](https://ably.com/docs/platform/account/users.md): Learn how to manage users, user roles, and the permissions associated with each role.
- [API keys](https://ably.com/docs/platform/account/app/api.md): “Manage Ably API keys by creating, updating, setting restrictions, and exploring integration options.”
- [Notifications](https://ably.com/docs/platform/account/app/notifications.md): Configure credentials for integrating Ably's push notification services with third-party services, send push notifications from the Ably dashboard, and inspect push notifications .”
- [Dev console](https://ably.com/docs/platform/account/app/console.md): Gain realtime insights into application-wide events, such as connection status changes, channel activity, and event logs.” meta_keywords: “Ably dev console, realtime monitoring, connection status changes, channel activity, event logs
- [App management overview](https://ably.com/docs/platform/account/app.md): Manage and monitor your applications on the Ably platform using the Ably dashboard. Create new apps, view existing ones, and configure settings from your browser.
- [Queues](https://ably.com/docs/platform/account/app/queues.md): Manage and configure Ably queues, monitor realtime data, and optimize performance.”
- [Settings](https://ably.com/docs/platform/account/app/settings.md): Manage your Ably application settings including security, billing, authentication, and protocol support to optimize performance and enhance security.
- [Stats](https://ably.com/docs/platform/account/app/stats.md): “Monitor and analyze your app's performance with Ably's dashboard. Access realtime stats and trends for optimized management."

### Architecture

- [Connection recovery](https://ably.com/docs/platform/architecture/connection-recovery.md): Understand how Ably's platform ensures reliable connection recovery when clients experience network disruption.
- [Edge network](https://ably.com/docs/platform/architecture/edge-network.md): Understand how Ably's edge network provides reliable, low-latency connectivity to its platform from anywhere in the world.
- [Fault tolerance](https://ably.com/docs/platform/architecture/fault-tolerance.md): Understand how Ably's platform is built to be fault tolerant to ensure high availability and reliability to clients.
- [Architecture overview](https://ably.com/docs/platform/architecture.md): Learn more about Ably's platform architecture.
- [Idempotency](https://ably.com/docs/platform/architecture/idempotency.md): Understand how Ably provides exactly-once message delivery through idempotent publishing.
- [Latency](https://ably.com/docs/platform/architecture/latency.md): Understand Ably's latency performance metrics and how they ensure consistent, low-latency message delivery across the global platform.
- [Infrastructure operations](https://ably.com/docs/platform/architecture/infrastructure-operations.md): Understand how Ably manages its infrastructure operations to ensure continued reliability and availability of its platform.
- [Performance](https://ably.com/docs/platform/architecture/performance.md): Understand how Ably delivers messages quickly and efficiently, even at high volumes.
- [Message ordering](https://ably.com/docs/platform/architecture/message-ordering.md): Understand how Ably achieves reliable message ordering across its platform.
- [Scalability of the Ably platform](https://ably.com/docs/platform/architecture/platform-scalability.md): Understand how Ably's platform achieves horizontal scalability to handle large-scale realtime messaging.

### Authentication

- [Basic auth](https://ably.com/docs/auth/basic.md): Basic authentication allows you to authenticate a secure server using an Ably API key and secret.
- [Identified clients](https://ably.com/docs/auth/identified-clients.md): Clients can be allocated a client ID to help control their operations and interactions with Ably channels.
- [Capabilities](https://ably.com/docs/auth/capabilities.md): Capabilities define which operations can be carried out on which channels by a client.
- [Authentication overview](https://ably.com/docs/auth.md): Ably supports two main authentication schemes: basic authentication and token authentication. Token authentication can be implemented using JWTs, Ably tokens, and Ably token requests.
- [Token revocation](https://ably.com/docs/auth/revocation.md): Token revocation is a mechanism that enables an app to invalidate authentication tokens.
- [Token auth](https://ably.com/docs/auth/token.md): Token authentication allows clients to authenticate with Ably, without exposing the Ably API key and secret.

### Deprecations

- [Deprecation policy](https://ably.com/docs/platform/deprecate.md): A policy detailing how Ably deprecates SDKs and APIs.
- [Deprecation of TLS 1.0 and 1.1 - June 2025](https://ably.com/docs/platform/deprecate/tls-v1-1.md): A policy detailing how Ably is deprecating support for TLS 1.0 and 1.1.
- [Deprecation of protocol version 1 - November 2025](https://ably.com/docs/platform/deprecate/protocol-v1.md): A policy detailing how Ably deprecates SDKs and APIs.

### Errors

- [Debugging](https://ably.com/docs/platform/errors.md): Debugging in Ably supported apps, including troubleshooting techniques, logging options, and tools for error analysis.
- [Error codes](https://ably.com/docs/platform/errors/codes.md): Understand Ably error codes and their causes, to resolve them efficiently.

### Integrations

- [Integrations overview](https://ably.com/docs/platform/integrations.md): Integrations enable external services to send data to Ably channels, and for Ably events to send their data to external services.
- [Skip integrations](https://ably.com/docs/platform/integrations/skip-integrations.md): Learn how to skip integrations on a per-message basis, including examples for skipping all or specific integration rules.
- [Ably Queues](https://ably.com/docs/platform/integrations/queues.md): Ably queues provide a queueing mechanism to integrate Ably with your external service.
- [Inbound webhooks](https://ably.com/docs/platform/integrations/inbound/webhooks.md): Incoming webhooks let you integrate external web services with Ably.
- [Outbound streaming overview](https://ably.com/docs/platform/integrations/streaming.md): Outbound streaming integrations enable you to stream data from Ably to an external service for realtime processing.
- [Datadog integration](https://ably.com/docs/platform/integrations/streaming/datadog.md): Connect Ably and Datadog to monitor messages, channels, and connections in realtime, integrating your Ably statistics with your existing Datadog setup.
- [Ably Kafka Connector](https://ably.com/docs/platform/integrations/inbound/kafka-connector.md): The Ably Kafka Connector sends data from Kafka to an Ably channel in realtime.
- [AMQP integration](https://ably.com/docs/platform/integrations/streaming/amqp.md): Send data to AMQP based on message, channel lifecycle, channel occupancy, and presence events.
- [Apache Kafka integration](https://ably.com/docs/platform/integrations/streaming/kafka.md): Send data to Kafka based on message, channel lifecycle, channel occupancy, and presence events.
- [AWS Kinesis integration](https://ably.com/docs/platform/integrations/streaming/kinesis.md): Send data to Kinesis based on message, channel lifecycle, channel occupancy, and presence events.
- [Apache Pulsar integration](https://ably.com/docs/platform/integrations/streaming/pulsar.md): Send data to Pulsar based on message, channel lifecycle, channel occupancy, and presence events.
- [AWS SQS integration](https://ably.com/docs/platform/integrations/streaming/sqs.md): Send data to SQS based on message, channel lifecycle, channel occupancy, and presence events.
- [Azure Functions integration](https://ably.com/docs/platform/integrations/webhooks/azure.md): Trigger Microsoft Azure functions based on message, channel lifecycle, channel occupancy, and presence events.
- [Google Function integration](https://ably.com/docs/platform/integrations/webhooks/gcp-function.md): Trigger Google Functions based on message, channel lifecycle, channel occupancy, and presence events.
- [Generic HTTP webhooks](https://ably.com/docs/platform/integrations/webhooks/generic.md): Configure generic HTTP webhooks to trigger HTTP endpoints and notify external services when events occur in Ably.
- [Cloudflare Worker integration](https://ably.com/docs/platform/integrations/webhooks/cloudflare.md): Trigger Cloudflare Workers based on message, channel lifecycle, channel occupancy, and presence events.
- [IFTTT integration](https://ably.com/docs/platform/integrations/webhooks/ifttt.md): Trigger IFTTT based on message, channel lifecycle, channel occupancy, and presence events.
- [AWS Lambda integration](https://ably.com/docs/platform/integrations/webhooks/lambda.md): Trigger AWS Lambda functions based on message, channel lifecycle, channel occupancy, and presence events.
- [Zapier integration](https://ably.com/docs/platform/integrations/webhooks/zapier.md): Trigger Zapier based on message, channel lifecycle, channel occupancy, and presence events.
- [Outbound webhooks overview](https://ably.com/docs/platform/integrations/webhooks.md): A guide on webhook payloads, including batched, enveloped, and non-enveloped event payloads, with decoding examples and sources.

### Pricing

- [Billing](https://ably.com/docs/platform/pricing/billing.md): Understand how invoicing and billing works for Ably packages.
- [Enterprise package](https://ably.com/docs/platform/pricing/enterprise.md): Explore the features of Ably's Enterprise package.
- [Free package](https://ably.com/docs/platform/pricing/free.md): Explore the features of Ably's Free package.
- [Pricing FAQs](https://ably.com/docs/platform/pricing/faqs.md): A list of the most commonly asked questions related to Ably pricing.
- [Pricing overview](https://ably.com/docs/platform/pricing.md): Understand the pricing models available to you, and understand the benefits of each package type.
- [Limits](https://ably.com/docs/platform/pricing/limits.md): The limits associated with each Ably package.
- [Standard package](https://ably.com/docs/platform/pricing/standard.md): Explore the features and cost of Ably's Standard package.
- [Pro package](https://ably.com/docs/platform/pricing/pro.md): Explore the features and cost of Ably's Pro package.
- [AI support chatbot pricing example](https://ably.com/docs/platform/pricing/examples/ai-chatbot.md): Calculate AI Transport pricing for conversations with an AI chatbot. Example shows how using the message-per-response pattern and modifying the append rollup window can generate cost savings.

## Pub/Sub

- [About Pub/Sub](https://ably.com/docs/basics.md): Learn more about what Ably Pub/Sub is and how you can use it to build powerful realtime applications.
- [Basic pub-sub](https://ably.com/docs/pub-sub.md): Get a channel, subscribe clients to it, and publish messages to the channel.
- [Advanced pub-sub](https://ably.com/docs/pub-sub/advanced.md): Utilize advanced pub-sub features, such as, subscription filters and idempotent publishing.

### API Reference

- [API Reference](https://ably.com/docs/api.md): API reference section of the Ably developer documentation.
- [REST API Token Request Spec](https://ably.com/docs/api/token-request-spec.md): Ably raw REST API specification for TokenRequests.

### Channels

- [Channel concepts](https://ably.com/docs/channels.md): Channels are used to organize message traffic within Ably.
- [Channel states](https://ably.com/docs/channels/states.md): Channels transition through multiple states.
- [Deltas](https://ably.com/docs/channels/options/deltas.md): The delta channel option enables clients to subscribe to a channel and only receive the difference between the present and previous message.
- [Encryption](https://ably.com/docs/channels/options/encryption.md): Encrypt message payloads using the cipher channel option.
- [Rewind](https://ably.com/docs/channels/options/rewind.md): The rewind channel option enables clients to attach to a channel and receive messages previously published on it.
- [Channel options overview](https://ably.com/docs/channels/options.md): Channel options customize the functionality of channels.

### Connections

- [Connections overview](https://ably.com/docs/connect.md): Establish and maintain a persistent connection to Ably using the realtime interface of an Ably SDK.
- [Connection state and recovery](https://ably.com/docs/connect/states.md): Establish and maintain a persistent connection to Ably using the Realtime SDK.

### Getting Started

- [Getting started: Pub/Sub with Flutter](https://ably.com/docs/getting-started/flutter.md): A getting started guide for Ably Pub/Sub Flutter that steps through some of the key features using Flutter.
- [Getting started: Pub/Sub in C\# .NET](https://ably.com/docs/getting-started/dotnet.md): A getting started guide for Ably Pub/Sub C# .NET that steps through some of the key features using C# and .NET.
- [Getting started: Pub/Sub in Go](https://ably.com/docs/getting-started/go.md): Get started with Pub/Sub in Go using Ably. Learn how to publish, subscribe, track presence, fetch message history, and manage realtime connections.
- [Getting started with Pub/Sub](https://ably.com/docs/getting-started.md): Getting started with Ably Pub/Sub in your language or framework of choice. Learn how to publish, subscribe, track presence, fetch message history, and manage realtime connections.
- [Getting started: Pub/Sub in Java](https://ably.com/docs/getting-started/java.md): A getting started guide for Ably Pub/Sub Java that steps through some of the key features using Java.
- [Getting started: Pub/Sub in Kotlin](https://ably.com/docs/getting-started/kotlin.md): Get started with Pub/Sub in Kotlin using Ably. Learn how to publish, subscribe, track presence, fetch message history, and manage realtime connections.
- [Getting started: Pub/Sub in Node.js](https://ably.com/docs/getting-started/node.md): Get started with Pub/Sub in JavaScript using Ably. Learn how to publish, subscribe, track presence, fetch message history, and manage realtime connections.
- [Getting started: Pub/Sub in JavaScript](https://ably.com/docs/getting-started/javascript.md): Get started with Pub/Sub in vanilla JavaScript using Ably. Learn how to publish, subscribe, track presence, fetch message history, and manage realtime connections.
- [Getting started: Pub/Sub in Objective-C](https://ably.com/docs/getting-started/objective-c.md): A getting started guide for Ably Pub/Sub Objective-C that steps through some of the key features using Objective-C.
- [Getting started: Pub/Sub in Laravel](https://ably.com/docs/getting-started/laravel.md): A getting started guide for Ably Pub/Sub Laravel 12 that steps through some of the key features using Laravel.
- [Getting started: Pub/Sub in PHP](https://ably.com/docs/getting-started/php.md): A getting started guide for Ably Pub/Sub PHP that steps through some of the key features using PHP.
- [React Hooks](https://ably.com/docs/getting-started/react-hooks.md): The React submodule enables you to use React Hooks to connect to Ably.
- [Getting started: Pub/Sub with React Native](https://ably.com/docs/getting-started/react-native.md): A getting started guide for Ably Pub/Sub React Native that steps through some of the key features using React Native with Expo.
- [Getting started: Pub/Sub in Python](https://ably.com/docs/getting-started/python.md): A getting started guide for Ably Pub/Sub Python that steps through some of the key features using Python.
- [Getting started: Pub/Sub in Ruby](https://ably.com/docs/getting-started/ruby.md): A getting started guide for Ably Pub/Sub Ruby that steps through some of the key features using Ruby.
- [Getting started: Pub/Sub with React](https://ably.com/docs/getting-started/react.md): A getting started guide for Ably Pub/Sub React that steps through some of the key features using React and Vite.
- [Getting started: Pub/Sub in Swift](https://ably.com/docs/getting-started/swift.md): Get started with Pub/Sub in Swift using Ably. Learn how to publish, subscribe, track presence, fetch message history, and manage realtime connections.

### Messages

- [Message batching](https://ably.com/docs/messages/batch.md): Send messages to multiple channels in a single transaction, or batch messages server-side before sending them to subscribers.
- [Message annotations](https://ably.com/docs/messages/annotations.md): Annotate messages on a channel with additional metadata.
- [Message concepts](https://ably.com/docs/messages.md): Messages contain data and are sent and received through channels.
- [Updates, deletes and appends](https://ably.com/docs/messages/updates-deletes.md): Update and delete messages published to a channel, and retrieve message version history.

### Metadata & Statistics

- [Statistics](https://ably.com/docs/metadata-stats/stats.md): Statistics are available at account-level and app-level to monitor your usage of Ably.
- [Metadata overview](https://ably.com/docs/metadata-stats/metadata.md): Metadata retrieves information about app activity, such as connections, channels and API requests.
- [Metadata REST requests](https://ably.com/docs/metadata-stats/metadata/rest.md): Retrieve metadata about single channels, or enumerate through all active channels via REST requests.
- [Metadata subscriptions](https://ably.com/docs/metadata-stats/metadata/subscribe.md): Retrieve metadata updates in realtime by subscribing to metachannels.

### Presence & Occupancy

- [Occupancy](https://ably.com/docs/presence-occupancy/occupancy.md): Occupancy provides high level metrics about the clients attached to a channel.
- [Presence and occupancy overview](https://ably.com/docs/presence-occupancy.md): Presence and occupancy provide information about clients attached to channels. This includes metrics about the attached clients, and details of the individual members attached to the channel.
- [Presence](https://ably.com/docs/presence-occupancy/presence.md): Presence enables clients to be aware of the other clients present on a channel.

### Protocols

- [Protocols](https://ably.com/docs/protocols.md): Clients can use the Ably network protocol adapters. This is especially useful where an Ably SDK is not available for your language of choice, or where platform resource constraints prohibit use of an SDK.
- [MQTT](https://ably.com/docs/protocols/mqtt.md): Any MQTT-enabled client can communicate with the Ably service through the Ably MQTT protocol adapter. This is especially useful where an Ably SDK is not available for your language of choice.
- [PubNub Adapter](https://ably.com/docs/protocols/pubnub.md): Use the PubNub Adapter to migrate from PubNub to Ably by only changing your API key.
- [Pusher Adapter](https://ably.com/docs/protocols/pusher.md): Use the Pusher Adapter to migrate from Pusher to Ably by only changing your API key.
- [SSE](https://ably.com/docs/protocols/sse.md): Ably provides support for Server-Sent Events (SSE). This is useful for where browser clients support SSE, and the use case does not require or support the resources used by an Ably SDK.

### Push Notifications

- [Push notifications overview](https://ably.com/docs/push.md): Ably delivers push notifications to user devices or browsers.
- [Publish and receive push notifications](https://ably.com/docs/push/publish.md): Learn how to publish and manage push notifications with Ably, covering direct and channel-based processes, payload details, and subscription management.
- [Configure and activate web browsers](https://ably.com/docs/push/configure/web.md): Learn how to set up and manage browser activations for push notifications with Ably, including platform installation, browser registration, and handling lifecycle events.
- [Configure and activate devices](https://ably.com/docs/push/configure/device.md): Learn how to set up and manage device activations for push notifications with Ably, including platform installation, device registration, and handling lifecycle events.

### REST SDK API Reference

- [SSE and Raw HTTP Streaming API](https://ably.com/docs/api/sse.md): Ably provides support for Server-Sent Events (SSE). This is useful for where browser clients support SSE, and the use case does not require or support the resources used by the Ably client library SDK.
- [Channel Status](https://ably.com/docs/api/rest-sdk/channel-status.md): Client Library SDK REST API Reference Channel Status documentation.
- [Messages](https://ably.com/docs/api/rest-sdk/messages.md): Client Library SDK REST API Reference Message documentation.
- [Encryption](https://ably.com/docs/api/rest-sdk/encryption.md): Client Library SDK REST API Reference Crypto documentation.
- [Channels](https://ably.com/docs/api/rest-sdk/channels.md): Client Library SDK REST API Reference Channels documentation.
- [History](https://ably.com/docs/api/rest-sdk/history.md): Client Library SDK REST API Reference History documentation.
- [Statistics](https://ably.com/docs/api/rest-sdk/statistics.md): Client Library SDK REST API Reference Statistics documentation.
- [Presence](https://ably.com/docs/api/rest-sdk/presence.md): Presence events provide clients with information about the status of other clients 'present' on a channel
- [Push Notifications - Admin](https://ably.com/docs/api/rest-sdk/push-admin.md): Client Library SDK REST API Reference Push documentation.
- [REST API Reference](https://ably.com/docs/api/rest-api.md): Ably provides the raw REST API for situations where an Ably client library SDK is not available on the platform of choice, or due to resource constraints.
- [Authentication](https://ably.com/docs/api/rest-sdk/authentication.md): Client Library SDK REST API Reference Authentication documentation.
- [Constructor](https://ably.com/docs/api/rest-sdk.md): Client Library SDK REST API Reference constructor documentation.
- [Types](https://ably.com/docs/api/rest-sdk/types.md): Client Library SDK REST API Reference Types documentation.

### Realtime SDK API Reference

- [Channel Metadata](https://ably.com/docs/api/realtime-sdk/channel-metadata.md): Realtime Client Library SDK API reference section for channel metadata.
- [Authentication](https://ably.com/docs/api/realtime-sdk/authentication.md): Realtime Client Library SDK API reference section for authentication.
- [Encryption](https://ably.com/docs/api/realtime-sdk/encryption.md): Realtime Client Library SDK API reference section for the crypto object.
- [Connection](https://ably.com/docs/api/realtime-sdk/connection.md): Realtime Client Library SDK API reference section for the connection object.
- [History](https://ably.com/docs/api/realtime-sdk/history.md): Realtime Client Library SDK API reference section for the history methods.
- [Messages](https://ably.com/docs/api/realtime-sdk/messages.md): Realtime Client Library SDK API reference section for the message object.
- [Statistics](https://ably.com/docs/api/realtime-sdk/statistics.md): Realtime Client Library SDK API reference section for the stats object.
- [Push Notifications - Admin](https://ably.com/docs/api/realtime-sdk/push-admin.md): Realtime Client Library SDK API reference section for push notifications admin.
- [Push Notifications - Device Activation and Subscription](https://ably.com/docs/api/realtime-sdk/push.md): Realtime Client Library SDK API reference section for push notification device subscription.
- [Channels](https://ably.com/docs/api/realtime-sdk/channels.md): Realtime Client Library SDK API reference section for the channels and channel objects.
- [Presence](https://ably.com/docs/api/realtime-sdk/presence.md): Realtime Client Library SDK API reference section for the presence object.
- [Constructor](https://ably.com/docs/api/realtime-sdk.md): Realtime Client Library SDK API reference section for the constructor object.
- [Types](https://ably.com/docs/api/realtime-sdk/types.md): Realtime Client Library SDK API reference section for types.

### Storage & History

- [Message Storage](https://ably.com/docs/storage-history/storage.md): Explore the different ways Ably can handle Message Storage
- [History](https://ably.com/docs/storage-history/history.md): Learn about accessing message history with the history and rewind features

## Chat

- [Connections](https://ably.com/docs/chat/connect.md): Manage the realtime connections to Ably.
- [About Chat](https://ably.com/docs/chat.md): Learn more about Ably Chat and the features that enable you to quickly build functionality into new and existing applications.
- [SDK setup](https://ably.com/docs/chat/setup.md): Install, authenticate and instantiate the Chat SDK.
- [Integrations](https://ably.com/docs/chat/integrations.md): Ably Chat integrations with external services.
- [Getting started with Chat](https://ably.com/docs/chat/getting-started.md): Getting started with Ably Chat in your language or framework of choice. Learn how to send and receive messages, track online presence, fetch message history, implement typing indicators, among other features.
- [Getting started: Chat in JavaScript / TypeScript](https://ably.com/docs/chat/getting-started/javascript.md): Get started with Ably's JavaScript Chat SDK. Build scalable, realtime chat applications using live chat APIs and realtime messaging.
- [Getting started: Chat with Android](https://ably.com/docs/chat/getting-started/android.md): A getting started guide for Ably Chat Android that steps through some of the key features using Jetpack Compose.
- [Getting started: Chat with JVM \(Kotlin/Java\)](https://ably.com/docs/chat/getting-started/jvm.md): A getting started guide for Ably Chat JVM that steps through some of the key features using Kotlin.
- [Getting started: Chat with React Native](https://ably.com/docs/chat/getting-started/react-native.md): A getting started guide for Ably Chat React Native that steps through some of the key features using React Native.
- [Getting started: Chat with React](https://ably.com/docs/chat/getting-started/react.md): A getting started guide for Ably Chat React that steps through some of the key features using React and Vite.
- [Moderation](https://ably.com/docs/chat/moderation.md): Detect and remove unwanted content in a Chat Room.
- [Getting started: Chat UI Kit for React](https://ably.com/docs/chat/getting-started/react-ui-kit.md): Step-by-step quick-start for ably-chat-react-ui-kit using React and Vite.
- [React UI Kit](https://ably.com/docs/chat/react-ui-kit.md): Learn more about the Ably Chat React UI Kit and how to use it to quickly build chat interfaces in your React applications.
- [Styling Ably Chat UI React Kit](https://ably.com/docs/chat/react-ui-kit/component-styling.md): A guide to styling components in the Ably Chat React UI Kit with and without Tailwind CSS.
- [Getting started: Chat with Swift \(Callback Approach\)](https://ably.com/docs/chat/getting-started/swift.md): A getting started guide for Ably Chat iOS that steps through some of the key features using SwiftUI with callback-based subscriptions.
- [React UI Kit setup](https://ably.com/docs/chat/react-ui-kit/setup.md): Install, configure and instantiate the Chat React UI Kit.
- [Providers and Hooks](https://ably.com/docs/chat/react-ui-kit/providers.md): Comprehensive documentation for the Ably Chat React UI Kits providers and hooks
- [Message storage and history](https://ably.com/docs/chat/rooms/history.md): Retrieve previously sent messages from history.
- [Ably Chat UI React Kit](https://ably.com/docs/chat/react-ui-kit/components.md): Comprehensive documentation for the Ably Chat React UI Kit.
- [Rooms](https://ably.com/docs/chat/rooms.md): Use rooms to organize your users and chat messages.
- [Share media](https://ably.com/docs/chat/rooms/media.md): Share media such as images, videos, or files in a chat room.
- [Message reactions](https://ably.com/docs/chat/rooms/message-reactions.md): React to chat messages
- [Messages](https://ably.com/docs/chat/rooms/messages.md): Send, update, delete, and receive messages in chat rooms.
- [Room reactions](https://ably.com/docs/chat/rooms/reactions.md): Enable users to send reactions at the room level, based on what is happening in your application, such as a goal being scored in your livestream.
- [Occupancy](https://ably.com/docs/chat/rooms/occupancy.md): Use occupancy to see how many users are in a room.
- [Presence](https://ably.com/docs/chat/rooms/presence.md): Use presence to see which users are online and their user status.
- [Typing indicators](https://ably.com/docs/chat/rooms/typing.md): Display typing indicators in a room so that users can see when someone else is writing a message.
- [Message replies](https://ably.com/docs/chat/rooms/replies.md): Add reply functionality to messages in a chat room.
- [Custom Moderation](https://ably.com/docs/chat/moderation/custom.md): Detect and remove unwanted content in a Chat Room using a custom provider
- [AWS Lambda](https://ably.com/docs/chat/moderation/custom/lambda.md): Detect and remove unwanted content in a Chat Room using AWS Lambda.
- [Bodyguard](https://ably.com/docs/chat/moderation/direct/bodyguard.md): Detect and remove unwanted content in a Chat Room using Bodyguard AI.
- [Azure Content Safety](https://ably.com/docs/chat/moderation/direct/azure.md): Detect and remove unwanted content in a Chat Room using Azure Content Safety.
- [Hive \(Dashboard\)](https://ably.com/docs/chat/moderation/direct/hive-dashboard.md): Detect and remove unwanted content in a Chat Room using Hive AI, providing human moderators a place to review and act on content.
- [Hive \(Model Only\)](https://ably.com/docs/chat/moderation/direct/hive-model-only.md): Detect and remove unwanted content in a Chat Room using Hive AI.
- [Tisane](https://ably.com/docs/chat/moderation/direct/tisane.md): Detect and remove unwanted content in a Chat Room using Tisane AI.

### API Reference

- [Ably Chat API Reference](https://ably.com/docs/chat/api.md): API reference section of the Ably Chat developer documentation.

## Spaces

- [Avatar stack](https://ably.com/docs/spaces/avatar.md): Avatar stacks display the online status of members in a space.
- [Live cursors](https://ably.com/docs/spaces/cursors.md): Track the positions of cursors within a space.
- [About Spaces](https://ably.com/docs/spaces.md): Spaces by Ably enables you to build collaborative environments in your application.
- [Component locking](https://ably.com/docs/spaces/locking.md): Component locking enables members to lock UI components before editing them to reduce the chances of conflicting changes being made.
- [React Hooks](https://ably.com/docs/spaces/react.md): Incorporate Spaces into your React application with idiomatic and user-friendly React Hooks.
- [Member location](https://ably.com/docs/spaces/locations.md): Member location displays where users are within a space.
- [SDK setup](https://ably.com/docs/spaces/setup.md): Install, authenticate and instantiate the Spaces SDK.
- [Space](https://ably.com/docs/spaces/space.md): A space is a virtual area of your application in which realtime collaboration between users can take place.

## LiveObjects

- [Batch operations](https://ably.com/docs/liveobjects/batch.md): Group multiple objects operations into a single channel message to apply grouped operations atomically and improve performance.
- [LiveCounter](https://ably.com/docs/liveobjects/counter.md): Create, update and receive updates for a numerical counter that synchronizes state across clients in realtime.
- [About LiveObjects](https://ably.com/docs/liveobjects.md): Learn about Ably LiveObjects, its features, use cases, and how it simplifies realtime state synchronization.
- [Lifecycle events](https://ably.com/docs/liveobjects/lifecycle.md): Understand lifecycle events for Objects, LiveMap and LiveCounter to track synchronization events and object deletions.
- [Inband Objects](https://ably.com/docs/liveobjects/inband-objects.md): Subscribe to LiveObjects updates from Pub/Sub SDKs.
- [Typing](https://ably.com/docs/liveobjects/typing.md): Type objects on a channel for type safety and code autocompletion.
- [LiveMap](https://ably.com/docs/liveobjects/map.md): Create, update and receive updates for a key/value data structure that synchronizes state across clients in realtime.
- [Object storage](https://ably.com/docs/liveobjects/storage.md): Learn about LiveObjects object storage.
- [Using the REST API](https://ably.com/docs/liveobjects/rest-api-usage.md): Learn how to work with Ably LiveObjects using the REST API
- [Billing](https://ably.com/docs/liveobjects/concepts/billing.md): Understand how LiveObjects operations contribute to your Ably usage and billing.
- [Instance](https://ably.com/docs/liveobjects/concepts/instance.md): Learn about Instance, a reference to a specific LiveObject instance for direct manipulation
- [Synchronization](https://ably.com/docs/liveobjects/concepts/synchronization.md): Learn how data is synchronized between clients.
- [Objects](https://ably.com/docs/liveobjects/concepts/objects.md): Learn how data is represented as objects in Ably LiveObjects
- [Getting started: LiveObjects in Java](https://ably.com/docs/liveobjects/quickstart/java.md): A quickstart guide to learn the basics of integrating the Ably LiveObjects product into your Java application.
- [PathObject](https://ably.com/docs/liveobjects/concepts/path-object.md): Learn about PathObject, a path-based API for accessing and manipulating LiveObjects data structures
- [Operations](https://ably.com/docs/liveobjects/concepts/operations.md): Learn how objects are updated by operations in Ably LiveObjects.
- [Getting started: LiveObjects in JavaScript](https://ably.com/docs/liveobjects/quickstart/javascript.md): A getting started guide to learn the basics of integrating the Ably LiveObjects product into your JavaScript application.
- [Getting started: LiveObjects in Swift](https://ably.com/docs/liveobjects/quickstart/swift.md): A quickstart guide to learn the basics of integrating the Ably LiveObjects product into your Swift application.

## LiveSync

- [About LiveSync](https://ably.com/docs/livesync.md): LiveSync enables you to synchronize changes in your database to application clients at scale.
- [MongoDB database connector](https://ably.com/docs/livesync/mongodb.md): The MongoDB database connector connects to your database and publishes document changes in realtime over Ably Pub/Sub channels
- [Postgres database connector](https://ably.com/docs/livesync/postgres.md): The Ably Database Connector connects your database to frontend clients in realtime through Ably channels.
- [Frontend data models](https://ably.com/docs/livesync/postgres/models.md): The frontend data models to keep your frontend applications up to date with your backend database.
- [Quickstart](https://ably.com/docs/livesync/postgres/quickstart.md): A quickstart guide to learn the basics of integrating the Ably LiveSync product into your application.

## AI Transport

- [About AI Transport](https://ably.com/docs/ai-transport.md): Learn more about Ably's AI Transport and the features that enable you to quickly build functionality into new and existing applications.
- [User input](https://ably.com/docs/ai-transport/messaging/accepting-user-input.md): Enable users to send prompts to AI agents over Ably with verified identity and message correlation.
- [Chain of thought](https://ably.com/docs/ai-transport/messaging/chain-of-thought.md): Stream chain-of-thought reasoning from thinking models in AI applications
- [Human in the loop](https://ably.com/docs/ai-transport/messaging/human-in-the-loop.md): Implement human-in-the-loop workflows for AI agents using Ably capabilities and claims to ensure authorized users approve sensitive tool calls.
- [Citations](https://ably.com/docs/ai-transport/messaging/citations.md): Attach source citations to AI responses using message annotations
- [Tool calls](https://ably.com/docs/ai-transport/messaging/tool-calls.md): Stream tool call execution visibility to users, enabling transparent AI interactions and generative UI experiences.
- [Sessions & identity overview](https://ably.com/docs/ai-transport/sessions-identity.md): Manage session lifecycle and identity in decoupled AI architectures
- [Identifying users and agents](https://ably.com/docs/ai-transport/sessions-identity/identifying-users-and-agents.md): Establish trusted identity and roles in decoupled AI sessions
- [Online status](https://ably.com/docs/ai-transport/sessions-identity/online-status.md): Use Ably Presence to show which users and agents are currently connected to an AI session
- [Message per response](https://ably.com/docs/ai-transport/token-streaming/message-per-response.md): Stream individual tokens from AI models into a single message over Ably.
- [Message per token](https://ably.com/docs/ai-transport/token-streaming/message-per-token.md): Stream individual tokens from AI models as separate messages over Ably.
- [Token streaming limits](https://ably.com/docs/ai-transport/token-streaming/token-rate-limits.md): Learn how token streaming interacts with Ably message limits and how to ensure your application delivers consistent performance.
- [Token streaming](https://ably.com/docs/ai-transport/token-streaming.md): Learn about token streaming with Ably AI Transport, including common patterns and the features provided by the Ably solution.

### Guides

- [Guide: Stream Anthropic responses using the message-per-response pattern](https://ably.com/docs/guides/ai-transport/anthropic-message-per-response.md): Stream tokens from the Anthropic Messages API over Ably in realtime using message appends.
- [Guide: Stream LangGraph responses using the message-per-response pattern](https://ably.com/docs/guides/ai-transport/lang-graph-message-per-response.md): Stream tokens from LangGraph over Ably in realtime using message appends.
- [Guide: Stream Anthropic responses using the message-per-token pattern](https://ably.com/docs/guides/ai-transport/anthropic-message-per-token.md): Stream tokens from the Anthropic Messages API over Ably in realtime.
- [Guide: Stream LangGraph responses using the message-per-token pattern](https://ably.com/docs/guides/ai-transport/lang-graph-message-per-token.md): Stream tokens from LangGraph over Ably in realtime.
- [Guide: Stream OpenAI responses using the message-per-response pattern](https://ably.com/docs/guides/ai-transport/openai-message-per-response.md): Stream tokens from the OpenAI Responses API over Ably in realtime using message appends.
- [Guide: Stream OpenAI responses using the message-per-token pattern](https://ably.com/docs/guides/ai-transport/openai-message-per-token.md): Stream tokens from the OpenAI Responses API over Ably in realtime.
- [Guide: Stream Vercel AI SDK responses using the message-per-response pattern](https://ably.com/docs/guides/ai-transport/vercel-message-per-response.md): Stream tokens from the Vercel AI SDK over Ably in realtime using message appends.
- [Guide: Stream Vercel AI SDK responses using the message-per-token pattern](https://ably.com/docs/guides/ai-transport/vercel-message-per-token.md): Stream tokens from the Vercel AI SDK over Ably in realtime.

## General

### FAQs

- [Pub/Sub FAQs](https://ably.com/docs/faq.md): Complete collection of Ably FAQ answers covering SDK issues, connection troubleshooting, configuration problems, and technical solutions.
- [Push notifications FAQs](https://ably.com/docs/faq/push-faqs.md): Frequently asked questions about Ably's push notification service, including debugging, configuration, and troubleshooting guides.
