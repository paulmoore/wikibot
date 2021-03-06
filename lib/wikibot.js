// Module includes
var util = require("util");
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

// Create a client for outgoing wikipedia HTTP requests
var client = restify.createJsonClient({
	url: "http://en.wikipedia.org"
});

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
			cb(constructError(hook, util.format("Command not found: '%s'.", command)));
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
		console.log(typeof(res));
		console.log(res);
		if (error) {
			cb(constructError(hook, error));
		} else {
			// Check that we have at least 1 page result
			if (res.length >= 4 && res[1].length > 0) {
				cb(constructResponse(res, 0));
			} else {
				cb(constructError(hook, util.format("Could not find any results for: '%s'.", hook.text)));
			}
		}
	});
};

// Functions

stripCommand = function(command, text) {
	return text.substr(command.length + 1);
};

makeQuery = function(action, params, cb) {
	// Construct the API query string
	var query = "/w/api.php?action=" + action;
	for (var key in params) {
		query += "&" + key + "=" + encodeURIComponent(params[key]);
	}

	console.log("Making API call to wikipedia: %s", query);

	// Make the HTTP request
	client.get(query, function(err, req, res, obj) {
		if (err) {
			console.error("Error making wikipedia request: '%s' %j", action, params);
			console.error(err);
			cb(util.format("Error making HTTP request: %d - %s.", res.statusCode, err.message));
		} else {
			cb(null, obj);
		}
	});
};

constructError = function(hook, message) {
	return {
		text: util.format("Sorry, @%s, I can't process that request because of this error: \"%s\"", hook.user_name, message)
	};
};

constructResponse = function(res, idx) {
	return {
		text: util.format("%s - \"%s\"... %s", res[1][idx], res[2][idx], res[3][idx])
	};
};
