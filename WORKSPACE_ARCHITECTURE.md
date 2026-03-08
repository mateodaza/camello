# Workspace Architecture

## Purpose

This document defines how Camello should think about workspaces going forward.

The key correction is:

- We are **not** removing workspaces as a product concept.
- We **are** removing the assumption that every agent type needs a large, custom dashboard by default.

The product should expose the operational surface that matches the agent's real unit of work.

## Core Model

Every agent can have up to three surfaces:

1. **Config**
   - Personality
   - Modules and autonomy
   - Knowledge
   - Rules, settings, danger-zone actions

2. **Operations**
   - The primary surface where the owner sees work happening and takes action
   - This depends on the agent type

3. **Analytics**
   - Secondary performance and trend reporting
   - Useful, but not where work happens

This means "workspace" is still a valid product idea, but the operational workspace should be chosen by work type, not by habit.

## Work Type Rules

### 1. Conversation-first agents

These agents do most of their work through customer conversations.

Examples:
- sales
- support
- some marketing agents

Primary operations surface:
- shared inbox

What the inbox must show:
- who is talking
- what the agent said
- what structured actions the agent took
- what context exists for the customer
- where the owner needs to intervene

### 2. Output-first agents

These agents mainly produce drafts, assets, or deliverables that need review.

Examples:
- marketing content agents

Primary operations surface:
- review/output workspace

The inbox may still exist, but it is not the dominant surface.

### 3. Task-first or document-first agents

These agents work on structured tasks, documents, approvals, or workflows rather than ongoing chats.

Examples:
- accountant
- finance
- lawyer

Primary operations surface:
- structured task/document workspace

The inbox may be relevant for intake, but it should not define the whole product for these agents.

## Product Decision for Workspace v2

Workspace v2 makes the inbox the shared operational layer for conversation-driven agents.

This is a deliberate simplification of the current product, not a statement that all future agents should be inbox-first.

In practical terms:

- `/dashboard/conversations` becomes the default operational home for conversation-first agents
- `/dashboard/agents/[id]` becomes the config surface
- `/dashboard/analytics` becomes the reporting surface
- specialized workspaces remain valid when an agent's primary unit of work is not conversation

## Sales as the Reference Implementation

Sales is the right first deep implementation because:

- it is close to revenue
- it is heavily conversation-linked
- it exposes clear owner actions
- it exercises customer context, structured agent actions, and intervention flow

Sales should be treated as the reference implementation for **conversation-centric operations**.

What sales should teach the platform:

- inbox + customer context composition
- owner intervention inside live work
- activity timeline from real module executions
- clear separation between config, operations, and analytics
- deep-linking into a selected work item

What sales should **not** become:

- the template for every future workspace

Accountant, finance, and legal agents should inherit platform patterns, not the sales UI itself.

## UX Principles

The owner should never have to guess:

- where work happens
- where configuration lives
- where analytics live
- which page is the source of truth

The UI should always make three things obvious:

1. what needs attention now
2. what the agent already did
3. what the owner can do next

## Routing Philosophy

Current recommendation:

- `/dashboard/conversations`
  - shared operational inbox for conversation-first agents

- `/dashboard/agents/[id]`
  - agent configuration

- `/dashboard/analytics`
  - shared analytics and reporting

- specialized routes
  - added only when an agent's primary unit of work is not conversation

Do not create a specialized workspace just because an agent type exists.
Create it only when the work itself demands a different operational surface.

## Guardrails

### Build the shared layer first

For conversation-driven agents, the inbox should be excellent before adding new specialized surfaces.

### Do not overfit the current archetypes

The current set of agents is not the final product taxonomy.
The architecture must remain open to:

- conversation-first agents
- output-first agents
- task-first agents
- document-first agents

### Keep analytics secondary

Analytics are important, but they should not become the primary workspace unless the underlying job is analytical.

## Decision Summary

The correct product direction is:

- keep workspaces as a concept
- stop assuming every agent needs a large custom dashboard
- make the inbox the shared operational layer for conversation-first agents
- keep specialized workspaces for agents whose primary work is not chat
- use sales as the reference implementation for the conversation-centric path

This is the working product architecture unless explicitly superseded.
