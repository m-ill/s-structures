# P2-M4 Combination And Envelope

status: preliminary

## Scope

This document closes T21-T24 as a versioned contract. Earlier work already
implemented KDS-style presets, rule generation, coverage audit, and envelope
recovery. This milestone exposes them as one API for reports and AI control.

## Ticket Mapping

| Ticket | Contract |
| --- | --- |
| T21 | combination group and purpose classification |
| T22 | rule-based signed lateral combination generation |
| T23 | load symbol and preset coverage audit |
| T24 | displacement, member, reaction, and drift envelope audit |

## Agent API

`getCombinationEnvelopeContract()` returns the grouped combinations, rule
generation summary, coverage audit, and governing envelope data.

## Verification

Run `npm run test:p2m4`.
