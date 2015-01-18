// Module includes
var http = require("http");
var restify = require("restify");
var Slack = require("node-slack");
var npmPackage = require("../package");

// Function forward declarations
var stripCommand, makeQuery, constructError, constructResponse;

// App config
var domain = process.env.DOMAIN;
var token = process.env.TOKEN;
var port = process.env.PORT;

// List of webhook enabled commands (setup from Slack)
var commands = {};

// Create the slack instance to send/receive messages
var slack = new Slack(domain, token);

// Create the http server
var server = restify.createServer({
	name: npmPackage.name,
	version: npmPackage.version
});
server.use(restify.bodyParser());

// Listen for all of the command hooks
server.post("/:command", function(req, res, next) {
	var command = req.params.command;

	console.log("Handling command: '%s'.", command);

	slack.respond(req.params, function(hook) {
		console.log("Hook details: %j", hook);

		// Callback once a response has been constructed
		var cb = function(reply) {
			console.log("Sending reply: %j", reply);
			res.send(reply);
		};

		// Try to find an appropriate command handler for the request
		var handler = commands[command];

		if (handler) {
			console.log("Found handler for command '%s'.", command);
			hook.text = stripCommand(command, hook.text);
			handler(hook, cb);
		} else {
			console.warn("No handler found for command: '%s'", command);
			cb(constructError(hook, "Command not found: '%s'.", command));
		}
	});
});

server.listen(port, function() {
	console.log("Server started on port %d.", port);
});

// Command handlers

commands["wiki"] = function(hook, cb) {
	makeQuery("opensearch", {
		search: hook.text,
		limit: 1,
		redirects: "resolve",
		format: "json"
	}, function(error, res) {
		if (error) {
			cb(constructError(hook, error));
		} else {
			if (res.length > 0 && res[0].length > 0) {
				cb(constructResponse(res, 0));
			} else {
				cb(constructError(hook, "Could not find any results for: '%s'.", hook.text));
			}
		}
	});
};

// Functions

stripCommand = function(command, text) {
	return text.substr(command.length);
};

makeQuery = function(action, params, cb) {
	// Construct the API query string
	var query = "http://en.wikipedia.org/w/api.php?action=" + action;
	for (var key in params) {
		query += "&" + key + "=" + encodeURIComponent(params[key]);
	}

	console.log("Making API call to wikipedia: %s", query);

	// Make the http request
	http.get(query, function(res) {
		cb(null, res);
	}).on("error", function(e) {
		console.error("Error making wikipedia request: '%s' %j", action, params);
		console.error(e);
		cb("Error making HTTP request: %d - %s.", res.statusCode, e.message);
	});
};

constructError = function(hook, message) {
	return {
		text: "Sorry, " + hook.user_name + ", I can't process that request because of this error: " + message
	};
};

constructResponse = function(res, idx) {
	return {
		text: util.format("%s - \"%s\"... %s", res[0][idx], res[1][idx], res[2][idx])
	};
};
