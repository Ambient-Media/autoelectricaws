var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  appointments: () => appointments,
  contactSubmissions: () => contactSubmissions,
  insertAppointmentSchema: () => insertAppointmentSchema,
  insertContactSchema: () => insertContactSchema,
  insertUserSchema: () => insertUserSchema,
  users: () => users
});
import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull()
});
var contactSubmissions = pgTable("contact_submissions", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  service: text("service"),
  vehicle: text("vehicle"),
  message: text("message"),
  urgent: boolean("urgent").default(false),
  createdAt: timestamp("created_at").defaultNow()
});
var appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  vehicle: text("vehicle").notNull(),
  service: text("service").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  notes: text("notes"),
  status: text("status").default("pending"),
  calendarEventId: text("calendar_event_id"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true
});
var insertContactSchema = createInsertSchema(contactSubmissions).omit({
  id: true,
  createdAt: true
});
var insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  status: true,
  createdAt: true
});

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage.ts
import { eq } from "drizzle-orm";
var DatabaseStorage = class {
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || void 0;
  }
  async getUserByUsername(username) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || void 0;
  }
  async createUser(insertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  async createContactSubmission(insertContact) {
    const [contact] = await db.insert(contactSubmissions).values(insertContact).returning();
    return contact;
  }
  async createAppointment(insertAppointment) {
    const [appointment] = await db.insert(appointments).values(insertAppointment).returning();
    return appointment;
  }
  async getAppointments() {
    return await db.select().from(appointments);
  }
  async getContactSubmissions() {
    return await db.select().from(contactSubmissions);
  }
};
var storage = new DatabaseStorage();

// server/routes.ts
import { z } from "zod";

// server/sms-service.ts
import twilio from "twilio";
var SMSService = class {
  client = null;
  fromNumber;
  constructor() {
    this.initializeTwilio();
  }
  initializeTwilio() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (accountSid && authToken && this.fromNumber) {
      this.client = twilio(accountSid, authToken);
    }
  }
  async sendBookingConfirmation(data) {
    if (!this.client || !this.fromNumber) {
      console.log("Twilio not configured - SMS notification skipped");
      return false;
    }
    try {
      const message = `Hi ${data.customerName}! Your automotive electrical service appointment at Auto Electric Missoula is confirmed:

Service: ${data.service}
Vehicle: ${data.vehicle}
Date: ${data.date}
Time: ${data.time}

We'll send you a reminder 24 hours before your appointment. If you need to reschedule, please call us at (406) 555-0123.

- Auto Electric Missoula Team`;
      await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: data.phone
      });
      console.log(`SMS confirmation sent to ${data.phone}`);
      return true;
    } catch (error) {
      console.error("Failed to send SMS:", error);
      return false;
    }
  }
  async sendBusinessNotification(data) {
    if (!this.client || !this.fromNumber) {
      console.log("Twilio not configured - business SMS notification skipped");
      return false;
    }
    const businessPhone = process.env.BUSINESS_NOTIFICATION_PHONE || "(406) 555-0123";
    try {
      const message = `New appointment booking at Auto Electric Missoula:

Customer: ${data.customerName}
Phone: ${data.phone}
Service: ${data.service}
Vehicle: ${data.vehicle}
Date: ${data.date}
Time: ${data.time}

Please confirm appointment and prepare for service.`;
      await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: businessPhone
      });
      console.log(`Business notification sent to ${businessPhone}`);
      return true;
    } catch (error) {
      console.error("Failed to send business SMS:", error);
      return false;
    }
  }
  async sendContactFormNotification(contactData) {
    if (!this.client || !this.fromNumber) {
      console.log("Twilio not configured - contact form SMS notification skipped");
      return false;
    }
    const businessPhone = process.env.BUSINESS_NOTIFICATION_PHONE || "(406) 555-0123";
    const urgentTag = contactData.urgent ? "[URGENT] " : "";
    try {
      const message = `${urgentTag}New contact form submission:

Name: ${contactData.name}
Phone: ${contactData.phone}
Email: ${contactData.email}
Service: ${contactData.service}
Message: ${contactData.message}

${contactData.urgent ? "This is marked as urgent - please respond promptly." : "Please follow up with the customer."}`;
      await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: businessPhone
      });
      console.log(`Contact form notification sent to ${businessPhone}`);
      return true;
    } catch (error) {
      console.error("Failed to send contact form SMS:", error);
      return false;
    }
  }
};
var smsService = new SMSService();

// server/calendar-service.ts
import { google } from "googleapis";
import { JWT } from "google-auth-library";
var CalendarService = class {
  calendar;
  auth = null;
  constructor() {
    this.initializeAuth();
  }
  initializeAuth() {
    try {
      const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      const calendarId = process.env.GOOGLE_CALENDAR_ID;
      if (!credentials || !calendarId) {
        console.log("Google Calendar not configured - calendar integration disabled");
        return;
      }
      const serviceAccount = JSON.parse(credentials);
      this.auth = new JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ["https://www.googleapis.com/auth/calendar"]
      });
      this.calendar = google.calendar({ version: "v3", auth: this.auth });
    } catch (error) {
      console.error("Failed to initialize Google Calendar auth:", error);
    }
  }
  async createAppointment(appointmentData) {
    if (!this.calendar || !this.auth) {
      console.log("Google Calendar not configured - appointment not created in calendar");
      return false;
    }
    try {
      const calendarId = process.env.GOOGLE_CALENDAR_ID;
      const startDateTime = /* @__PURE__ */ new Date(`${appointmentData.date}T${appointmentData.time}:00`);
      const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1e3);
      const event = {
        summary: `${appointmentData.service} - ${appointmentData.customerName}`,
        description: `
Customer: ${appointmentData.customerName}
Phone: ${appointmentData.customerPhone}
Email: ${appointmentData.customerEmail}
Vehicle: ${appointmentData.vehicle}
Service: ${appointmentData.service}
${appointmentData.notes ? `Notes: ${appointmentData.notes}` : ""}
        `.trim(),
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: "America/Denver"
          // Montana timezone
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: "America/Denver"
        },
        reminders: {
          useDefault: true
        }
      };
      const response = await this.calendar.events.insert({
        calendarId,
        resource: event,
        sendUpdates: "all"
        // Send email invitations
      });
      console.log(`Calendar event created: ${response.data.id}`);
      return true;
    } catch (error) {
      console.error("Failed to create calendar event:", error);
      return false;
    }
  }
  async getAvailableSlots(date) {
    if (!this.calendar || !this.auth) {
      console.log("Google Calendar not configured - returning default availability");
      return this.getDefaultAvailableSlots(date);
    }
    try {
      const calendarId = process.env.GOOGLE_CALENDAR_ID;
      const startOfDay = /* @__PURE__ */ new Date(`${date}T08:00:00`);
      const endOfDay = /* @__PURE__ */ new Date(`${date}T18:00:00`);
      const response = await this.calendar.events.list({
        calendarId,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: "startTime"
      });
      const existingEvents = response.data.items || [];
      const busySlots = existingEvents.map((event) => ({
        start: new Date(event.start.dateTime).getHours(),
        end: new Date(event.end.dateTime).getHours()
      }));
      const availableSlots = [];
      for (let hour = 8; hour < 18; hour++) {
        const isAvailable = !busySlots.some(
          (busy) => hour >= busy.start && hour < busy.end
        );
        availableSlots.push({
          start: `${hour.toString().padStart(2, "0")}:00`,
          end: `${(hour + 1).toString().padStart(2, "0")}:00`,
          available: isAvailable
        });
      }
      return availableSlots;
    } catch (error) {
      console.error("Failed to get calendar availability:", error);
      return this.getDefaultAvailableSlots(date);
    }
  }
  getDefaultAvailableSlots(date) {
    const slots = [];
    for (let hour = 8; hour < 18; hour++) {
      slots.push({
        start: `${hour.toString().padStart(2, "0")}:00`,
        end: `${(hour + 1).toString().padStart(2, "0")}:00`,
        available: true
      });
    }
    return slots;
  }
  async updateAppointment(eventId, appointmentData) {
    if (!this.calendar || !this.auth) {
      console.log("Google Calendar not configured - appointment not updated in calendar");
      return false;
    }
    try {
      const calendarId = process.env.GOOGLE_CALENDAR_ID;
      const existingEvent = await this.calendar.events.get({
        calendarId,
        eventId
      });
      const updatedEvent = {
        ...existingEvent.data,
        summary: appointmentData.service && appointmentData.customerName ? `${appointmentData.service} - ${appointmentData.customerName}` : existingEvent.data.summary
      };
      if (appointmentData.date && appointmentData.time) {
        const startDateTime = /* @__PURE__ */ new Date(`${appointmentData.date}T${appointmentData.time}:00`);
        const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1e3);
        updatedEvent.start = {
          dateTime: startDateTime.toISOString(),
          timeZone: "America/Denver"
        };
        updatedEvent.end = {
          dateTime: endDateTime.toISOString(),
          timeZone: "America/Denver"
        };
      }
      await this.calendar.events.update({
        calendarId,
        eventId,
        resource: updatedEvent,
        sendUpdates: "all"
      });
      console.log(`Calendar event updated: ${eventId}`);
      return true;
    } catch (error) {
      console.error("Failed to update calendar event:", error);
      return false;
    }
  }
  async cancelAppointment(eventId) {
    if (!this.calendar || !this.auth) {
      console.log("Google Calendar not configured - appointment not cancelled in calendar");
      return false;
    }
    try {
      const calendarId = process.env.GOOGLE_CALENDAR_ID;
      await this.calendar.events.delete({
        calendarId,
        eventId,
        sendUpdates: "all"
      });
      console.log(`Calendar event cancelled: ${eventId}`);
      return true;
    } catch (error) {
      console.error("Failed to cancel calendar event:", error);
      return false;
    }
  }
};
var calendarService = new CalendarService();

// server/email-service.ts
import { MailService } from "@sendgrid/mail";
var EmailService = class {
  mailService = null;
  constructor() {
    this.initializeSendGrid();
  }
  initializeSendGrid() {
    try {
      if (process.env.SENDGRID_API_KEY) {
        this.mailService = new MailService();
        this.mailService.setApiKey(process.env.SENDGRID_API_KEY);
        console.log("SendGrid email service initialized");
      } else {
        console.log("SendGrid not configured - email notifications disabled");
      }
    } catch (error) {
      console.error("Failed to initialize SendGrid:", error);
    }
  }
  async sendContactFormNotification(contactData) {
    if (!this.mailService) {
      console.log("SendGrid not configured - contact form email skipped");
      return false;
    }
    try {
      const urgentFlag = contactData.urgent ? "[URGENT] " : "";
      const subject = `${urgentFlag}New Contact Form Submission - ${contactData.firstName} ${contactData.lastName}`;
      const htmlContent = `
        <h2>New Contact Form Submission</h2>
        ${contactData.urgent ? '<p style="color: red; font-weight: bold;">\u26A0\uFE0F URGENT REQUEST</p>' : ""}
        
        <h3>Customer Information:</h3>
        <ul>
          <li><strong>Name:</strong> ${contactData.firstName} ${contactData.lastName}</li>
          <li><strong>Email:</strong> ${contactData.email}</li>
          <li><strong>Phone:</strong> ${contactData.phone}</li>
          <li><strong>Vehicle:</strong> ${contactData.vehicle}</li>
          <li><strong>Service:</strong> ${contactData.service}</li>
        </ul>

        <h3>Message:</h3>
        <p>${contactData.message}</p>

        <hr>
        <p><em>This email was sent from the Auto Electric Missoula contact form.</em></p>
      `;
      const textContent = `
New Contact Form Submission
${contactData.urgent ? "\u26A0\uFE0F URGENT REQUEST" : ""}

Customer Information:
Name: ${contactData.firstName} ${contactData.lastName}
Email: ${contactData.email}
Phone: ${contactData.phone}
Vehicle: ${contactData.vehicle}
Service: ${contactData.service}

Message:
${contactData.message}

This email was sent from the Auto Electric Missoula contact form.
      `;
      const verifiedSender = process.env.VERIFIED_SENDER_EMAIL || "your-verified-email@example.com";
      const notificationEmail = process.env.NOTIFICATION_EMAIL || verifiedSender;
      await this.mailService.send({
        to: notificationEmail,
        from: verifiedSender,
        subject,
        text: textContent,
        html: htmlContent
      });
      console.log("Contact form notification email sent successfully");
      return true;
    } catch (error) {
      console.error("Failed to send contact form notification:", error);
      return false;
    }
  }
  async sendCustomerConfirmation(contactData) {
    if (!this.mailService) {
      return false;
    }
    try {
      const subject = "Thank you for contacting Auto Electric Missoula";
      const htmlContent = `
        <h2>Thank you for contacting Auto Electric Missoula!</h2>
        
        <p>Hi ${contactData.firstName},</p>
        
        <p>We've received your message and will get back to you within 2 business hours during our operating hours:</p>
        
        <p><strong>Monday - Friday: 8:00 AM - 4:00 PM</strong></p>
        
        <h3>Your message details:</h3>
        <ul>
          <li><strong>Service:</strong> ${contactData.service}</li>
          <li><strong>Vehicle:</strong> ${contactData.vehicle}</li>
          <li><strong>Message:</strong> ${contactData.message}</li>
        </ul>

        <p>If you have an urgent electrical issue, please call us directly at <strong>(406) 728-9153</strong>.</p>

        <p>Thank you for choosing Auto Electric Missoula for your automotive electrical needs!</p>

        <hr>
        <p>
          <strong>Auto Electric Service Co.</strong><br>
          2602 West Broadway<br>
          Missoula, MT 59808<br>
          Phone: (406) 728-9153
        </p>
      `;
      const verifiedSender = process.env.VERIFIED_SENDER_EMAIL || "your-verified-email@example.com";
      await this.mailService.send({
        to: contactData.email,
        from: verifiedSender,
        subject,
        html: htmlContent
      });
      console.log("Customer confirmation email sent successfully");
      return true;
    } catch (error) {
      console.error("Failed to send customer confirmation:", error);
      return false;
    }
  }
};
var emailService = new EmailService();

// server/routes.ts
async function registerRoutes(app2) {
  app2.post("/api/contact", async (req, res) => {
    try {
      const contactData = insertContactSchema.parse(req.body);
      const contact = await storage.createContactSubmission(contactData);
      await emailService.sendContactFormNotification({
        firstName: contactData.firstName,
        lastName: contactData.lastName,
        email: contactData.email ?? "",
        phone: contactData.phone ?? "",
        service: contactData.service ?? "",
        vehicle: contactData.vehicle ?? "",
        message: contactData.message ?? "",
        urgent: contactData.urgent ?? false
      });
      await emailService.sendCustomerConfirmation({
        firstName: contactData.firstName,
        lastName: contactData.lastName,
        email: contactData.email ?? "",
        phone: contactData.phone ?? "",
        service: contactData.service ?? "",
        vehicle: contactData.vehicle ?? "",
        message: contactData.message ?? "",
        urgent: contactData.urgent ?? false
      });
      await smsService.sendContactFormNotification({
        name: `${contactData.firstName} ${contactData.lastName}`,
        phone: contactData.phone ?? "",
        email: contactData.email ?? "",
        service: contactData.service ?? "",
        message: contactData.message ?? "",
        urgent: contactData.urgent ?? false
      });
      res.json({ success: true, id: contact.id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.errors });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });
  app2.post("/api/appointments", async (req, res) => {
    try {
      const appointmentData = insertAppointmentSchema.parse(req.body);
      const calendarData = {
        customerName: `${appointmentData.firstName} ${appointmentData.lastName}`,
        customerEmail: appointmentData.email,
        customerPhone: appointmentData.phone,
        service: appointmentData.service,
        vehicle: appointmentData.vehicle,
        date: appointmentData.date,
        time: appointmentData.time,
        notes: appointmentData.notes || void 0
      };
      const calendarEventCreated = await calendarService.createAppointment(calendarData);
      const appointment = await storage.createAppointment(appointmentData);
      const smsData = {
        customerName: `${appointmentData.firstName} ${appointmentData.lastName}`,
        phone: appointmentData.phone,
        service: appointmentData.service,
        date: appointmentData.date,
        time: appointmentData.time,
        vehicle: appointmentData.vehicle
      };
      await Promise.all([
        smsService.sendBookingConfirmation(smsData),
        smsService.sendBusinessNotification(smsData)
      ]);
      res.json({
        success: true,
        id: appointment.id,
        calendarEventCreated
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.errors });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });
  app2.get("/api/availability/:date", async (req, res) => {
    try {
      const { date } = req.params;
      const availableSlots = await calendarService.getAvailableSlots(date);
      res.json({ date, slots: availableSlots });
    } catch (error) {
      res.status(500).json({ error: "Failed to get availability" });
    }
  });
  app2.get("/api/appointments", async (req, res) => {
    try {
      const appointments2 = await storage.getAppointments();
      res.json(appointments2);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/contacts", async (req, res) => {
    try {
      const contacts = await storage.getContactSubmissions();
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = 5e3;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
