import { Command } from "commander";
import { statusCommand } from "./commands/status.js";
import { lockCommand } from "./commands/lock.js";
import { unlockCommand } from "./commands/unlock.js";
import {
  scheduleAddCommand,
  scheduleListCommand,
  scheduleRemoveCommand,
} from "./commands/schedule.js";
import { statsCommand } from "./commands/stats.js";
import { configGetCommand, configSetCommand } from "./commands/config.js";
import { installCommand, uninstallCommand } from "./commands/install.js";

const program = new Command();

program
  .name("cc-lock")
  .description("Lock yourself out of Claude Code CLI")
  .version("0.1.0");

program
  .command("status")
  .description("Show current lock state and usage")
  .action(async () => {
    try {
      await statusCommand();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("lock")
  .description("Lock Claude Code for a duration (e.g., 30m, 2h, 1d)")
  .argument("<duration>", "Lock duration (e.g., 30m, 2h, 1d)")
  .action(async (duration: string) => {
    try {
      await lockCommand(duration);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("unlock")
  .description("Unlock Claude Code (bypass challenge if locked)")
  .action(async () => {
    try {
      await unlockCommand();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const schedule = program
  .command("schedule")
  .description("Manage recurring lock schedules");

schedule
  .command("add")
  .description("Add a new schedule (interactive)")
  .action(async () => {
    try {
      await scheduleAddCommand();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

schedule
  .command("list")
  .description("List all schedules")
  .action(async () => {
    try {
      await scheduleListCommand();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

schedule
  .command("remove")
  .description("Remove a schedule")
  .argument("<id>", "Schedule ID")
  .action(async (id: string) => {
    try {
      await scheduleRemoveCommand(id);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

const config = program
  .command("config")
  .description("View or edit configuration");

config
  .command("get")
  .description("Show current configuration")
  .action(async () => {
    try {
      await configGetCommand();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

config
  .command("set")
  .description("Set a configuration value")
  .argument("<key>", "Config key (graceMinutes, chmodGuard)")
  .argument("<value>", "New value")
  .action(async (key: string, value: string) => {
    try {
      await configSetCommand(key, value);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("stats")
  .description("Show usage statistics")
  .option("--week", "Show last 7 days")
  .option("--month", "Show last 30 days")
  .action(async (options: { week?: boolean; month?: boolean }) => {
    try {
      await statsCommand(options);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("tui")
  .description("Launch interactive TUI dashboard")
  .action(async () => {
    try {
      const { launchTui } = await import("@cc-lock/tui");
      await launchTui();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("install")
  .description("Install cc-lock (detect Claude, set up daemon)")
  .action(async () => {
    try {
      await installCommand();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("uninstall")
  .description("Uninstall cc-lock (restore Claude, remove daemon)")
  .action(async () => {
    try {
      await uninstallCommand();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse();
