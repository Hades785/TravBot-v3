import Command from "../../core/command";
import {queryClosestEmoteByName} from "./subcommands/emote-utils";
import {botHasPermission} from "../../core/libd";
import {Permissions} from "discord.js";

export default new Command({
    description: "Send the specified emote.",
    run: "Please provide a command name.",
    any: new Command({
        description: "The emote(s) to send.",
        usage: "<emotes...>",
        async run({guild, channel, message, args}) {
            let output = "";
            for (const query of args) output += queryClosestEmoteByName(query).toString();
            channel.send(output);
        }
    })
});
