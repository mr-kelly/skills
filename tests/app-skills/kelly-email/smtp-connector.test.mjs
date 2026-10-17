import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { sendSupportReply } from "../../../skills/kelly-email/scripts/lib/smtp-connector.ts";

async function smtpSink() {
  const messages = [];
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    socket.write("220 localhost ESMTP\r\n");
    let buffer = "";
    let data = "";
    let inData = false;
    socket.on("data", (chunk) => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const index = buffer.indexOf("\r\n");
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            messages.push(data);
            data = "";
            inData = false;
            socket.write("250 2.0.0 queued as sink-receipt-123\r\n");
          } else data += `${line}\r\n`;
          continue;
        }
        const command = line.toUpperCase();
        if (command.startsWith("EHLO") || command.startsWith("HELO"))
          socket.write("250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 PIPELINING\r\n");
        else if (command.startsWith("AUTH")) socket.write("235 2.7.0 authenticated\r\n");
        else if (command.startsWith("MAIL FROM") || command.startsWith("RCPT TO")) socket.write("250 2.1.0 ok\r\n");
        else if (command === "DATA") {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (command === "QUIT") {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    messages,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("support connector performs a real SMTP round trip with deterministic threading", async () => {
  const sink = await smtpSink();
  const config = {
    mailboxes: [
      {
        mailbox_id: "support-mailbox",
        primary_email: "support@example.test",
        aliases: [],
        send_identities: ["support-identity"],
        smtp: {
          host: "127.0.0.1",
          port: sink.port,
          security: "plain",
          username: "support@example.test",
          password_env: "SMTP_TEST_PASSWORD",
        },
      },
    ],
    identities: [
      {
        identity_id: "support-identity",
        mailbox_id: "support-mailbox",
        send_as_email: "support@example.test",
        display_name: "Example Support",
        use_when: { recipient_addresses: ["support@example.test"] },
      },
    ],
  };
  const request = {
    idempotencyKey: "support-ticket:review-version-1",
    fromAddress: "Other <other@example.test>, Support <support@example.test>",
    toAddress: "customer@example.test",
    customerName: "Customer",
    subject: "Need help",
    text: "The approved support answer.",
    inReplyTo: "<incoming-1@example.test>",
    references: "<older@example.test>",
  };
  try {
    const dryRun = await sendSupportReply(request, config, { dryRun: true });
    assert.equal(dryRun.dryRun, true);
    assert.equal(sink.messages.length, 0);
    const accountFallback = await sendSupportReply(
      { ...request, fromAddress: "", mailboxId: "support-mailbox" },
      config,
      { dryRun: true },
    );
    assert.equal(accountFallback.identityId, "support-identity");

    const result = await sendSupportReply(request, config, {
      dryRun: false,
      resolveSecret: async () => "test-only-password",
    });
    assert.equal(result.ok, true);
    assert.equal(result.threaded, true);
    assert.deepEqual(result.accepted, ["customer@example.test"]);
    assert.equal(result.messageId, dryRun.messageId);
    assert.equal(result.submittedMessageId, dryRun.submittedMessageId);
    assert.equal(result.providerReceiptId, "250 2.0.0 queued as sink-receipt-123");
    assert.equal(sink.messages.length, 1);
    assert.match(sink.messages[0], /From: Example Support <support@example\.test>/);
    assert.match(sink.messages[0], /To: Customer <customer@example\.test>/);
    assert.match(sink.messages[0], /In-Reply-To: <incoming-1@example\.test>/);
    assert.match(sink.messages[0], /References: <older@example\.test> <incoming-1@example\.test>/);
    assert.match(sink.messages[0], /The approved support answer\./);
    assert.match(sink.messages[0], new RegExp(result.messageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    await sink.close();
  }
});
