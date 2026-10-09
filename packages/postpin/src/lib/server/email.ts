import nodemailer from "nodemailer";
import {SMTP_HOST, SMTP_MAIL_FROM, SMTP_PASSWORD, SMTP_PORT, SMTP_SECURE, SMTP_USER } from "$app/env/private";

// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASSWORD,
  },
});

try {
  await transporter.verify();
  console.log("Server is ready to take our messages");
} catch (err) {
  console.error("Verification failed:", err);
}

export function sendEmail(to: string, subject: string, text: string) {
  const mailOptions = {
    from: SMTP_MAIL_FROM ?? SMTP_USER,
    to,
    subject,
    text,
  };

  return transporter.sendMail(mailOptions);
}