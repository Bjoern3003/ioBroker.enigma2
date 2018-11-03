/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

const request		= require('request');
const net			= require('net');
const http			= require('http');
const querystring	= require('querystring');
const xml2js		= require('xml2js');
const utils 		= require(__dirname + '/lib/utils');
const adapter 		= utils.adapter('enigma2');

function respData() {
	this.data = [];
	
	this.addData = function(key, val)
	{
		this.data[key] = val;
	}
	
	this.getData = function(key) 
	{
		return this.data[key];
	}
};

function enigma2() {
	this.isConnected      	= null;
	this.deviceId         	= 1;
	this.e2bouquetidx		= 0;
	this.e2serviceidx		= 0;
	this.piconext 			= 'png';
	this.PATH = {
		MESSAGEANSWER:		'/web/messageanswer?getanswer=now',
		DEVICEINFO:			'/web/deviceinfo',
		REMOTE_CONTROL:		'/web/remotecontrol?command=',
		VOLUME:				'/web/vol',
		VOLUME_SET:			'/web/vol?set=set',
		ABOUT:				'/web/about',
		GET_CURRENT:		'/web/getcurrent',
		POWERSTATE:			'/web/powerstate',
		MESSAGE:			'/web/message?text=',
		DELETE:				'/web/timerdelete?sRef=',
		TIMER_TOGGLE:		'/api/timertogglestatus?sRef=',
		TIMERLIST:			'/web/timerlist',
		SERVICELIST:		'/web/getallservices',
		IP_CHECK:			'/web/about'
	};
	this.piconext = 'png';
	
	this.init = function()
	{
		adapter.setObject('enigma2.MODEL',{type:'state',common:{type:'string',role:'state',name:'Receiver Model',read:true,write:false},native:{}});
		adapter.setObject('enigma2.WEB_IF_VERSION',{type:'state',common:{type:'string',role:'state',name:'Receiver Webinterface Version',read:true,write:false},native:{}});
		adapter.setObject('enigma2.NETWORK',{type:'state',common:{type:'string',role:'state',name:'Receiver used Network',read:true,write:false},native:{}});
		adapter.setObject('enigma2.BOX_IP',{type:'state',common:{type:'string',role:'info.ip',name:'Receiver IP-Adress',read:true,write:false},native:{}})

		//Check ever 3 secs
	   // adapter.log.info("starting Polling every " + adapter.config.PollingInterval + " ms");
		//setInterval(checkStatus,adapter.config.PollingInterval);
		this.getResponse('DEVICEINFO', this.PATH['DEVICEINFO'], this.evaluateCommandResponse);
		
		this.main();
		
		this.timer();
	}
	
	this.main = function()
	{
		var e2 = this;
		// adapter.config:
		adapter.log.debug('config IPAddress: ' + adapter.config.IPAddress);
		adapter.log.debug('config Port: ' + adapter.config.PortWebIf);			
		adapter.log.debug('config Username: ' + adapter.config.Username);
		adapter.log.debug('config Password'+ adapter.config.Password);

		adapter.setObject('Message.Text',{type:'state',common:{type:'string',role:'text',name:'Send a info Message to the Receiver Screen',desc:'messagetext=Text of Message',read:false,write:true},native:{}});
		adapter.setObject('Message.Type',{type:'state',common:{type:'number',role:'state',name:'Message Typ: 0= Yes/No, 1= Info, 2=Message, 3=Attention',desc:'messagetype=Number from 0 to 3, 0= Yes/No, 1= Info, 2=Message, 3=Attention',states:{0:'Yes/No',1:'Info',2:'Message',3:'Attention'},min:0,max:3,read:true,write:true},native:{}});
		adapter.setObject('Message.Timeout',{type:'state',common:{type:'number',role:'control',desc:'timeout=Can be empty or the Number of seconds the Message should disappear after',read:true,write:true},native:{}});
		
		adapter.setState('Message.Type',true,true);
		adapter.setState('Message.Timeout', 15, true );
		
		if(adapter.config.PortEnigma > 0)
		{
			adapter.log.debug('config EnigmaLight Port: ' + adapter.config.PortEnigma);
			
			adapter.setObjectNotExists('enigma2.ENIGMALIGHT_ENABLED', {
				type: 'state',
				common: {
					type: 	'boolean',
					role: 	'state',
					name: 	'EnigmaLight Server erreichbar?',
					read:  	true,
					write: 	false
				},
				native: {}
			});
			adapter.setObjectNotExists('enigma2.ENIGMALIGHT_LIGHTSON', {
				type: 'state',
				common: {
					type: 	'boolean',
					role: 	'state',
					name: 	'Enigmalight Licht eingeschaltet',
					read:  	true,
					write: 	false
				},
				native: {}
			});
			adapter.setObjectNotExists('command.ENIGMALIGHT_LIGHTSONOFF', {
				type: 'state',
				common: {
					type: 	'boolean',
					role: 	'button',
					name: 	'Enigmalight Licht ein/ausschalten',
					read:  	false,
					write: 	true
				},
				native: {}
			});
		}
		// CommandStates
		for (var k in this.commands){
			adapter.setObjectNotExists('command.' + k, {
				type: 'state',
				common: {
					type: 	'boolean',
					role: 	'button',
					name: 	k + ' Button',
					read:  	false,
					write: 	true
				},
				native: {}
			});
		}

		//+++++++++ Verbindung +++++++++++++++++++++
		adapter.setObject('enigma2-CONNECTION',{type:'state',common:{type:'boolean',role:'state',name:'Connection to Receiver',read:true,write:false},native:{}});
		adapter.setState('enigma2-CONNECTION', false, true );

		//+++++++++++++++++++++++++ STATE +++++++++++++++++++++++++++++++++++++++++++
		adapter.setObject('enigma2.VOLUME',{type:'state',common:{type:'number',role:'level.volume',name:'Volume 0-100%',read:true,write:false},native:{}});
		adapter.setObject('enigma2.MESSAGE_ANSWER',{type:'state',common:{type:'integer',role:'message',name:'Message Answer',read:true,write:false},native:{}});
		adapter.setObject('enigma2.MUTED',{type:'state',common:{type:'boolean',role:'media.mute',name:'is Muted',read:true,write:false},native:{}});
		adapter.setObject('enigma2.EVENTDURATION',{type:'state',common:{type:'number',role:'media.duration',name:'EVENT DURATION',read:true,write:false},native:{}});
		adapter.setObject('enigma2.EVENTREMAINING',{type:'state',common:{type:'number',role:'media.duration',name:'EVENT REMAINING',read:true,write:false},native:{}});
		adapter.setObject('enigma2.STANDBY',{type:'state',common:{type:'boolean',role:'state',name:'Receiver in Standby',read:true,write:false},native:{}});
		adapter.setObject('enigma2.CHANNEL',{type:'state',common:{type:'string',role:'state',name:'Channel Name',read:true,write:false},native:{}});
		adapter.setObject('enigma2.CHANNEL_SERVICEREFERENCE',{type:'state',common:{type:'string',role:'state',name:'Servicereference Code',read:true,write:false},native:{}});
		adapter.setObject('enigma2.CHANNEL_PICON',{type:'state',common:{type:'string',role:'state',name:'Servicereference Picon',read:true,write:false},native:{}});
		adapter.setObject('enigma2.PROGRAMM',{type:'state',common:{type:'string',role:'state',name:'current Programm',read:true,write:false},native:{}});
		adapter.setObject('enigma2.PROGRAMM_INFO',{type:'state',common:{type:'string',role:'state',name:'current Programm Info',read:true,write:false},native:{}});
		adapter.setObject('enigma2.PROGRAMM_AFTER',{type:'state',common:{type:'string',role:'state',name:'Programm after',read:true,write:false},native:{}});
		adapter.setObject('enigma2.PROGRAMM_AFTER_INFO',{type:'state',common:{type:'string',role:'state',name:'Programm Info after',read:true,write:false},native:{}});
		adapter.setObject('enigma2.EVENTDESCRIPTION',{type:'state',common:{type:'string',role:'state',name:'Event description',read:true,write:false},native:{}});
		adapter.setObject('enigma2.EVENTREMAINING',{type:'state',common:{type:'number',role:'media.duration',name:'EVENT REMAINING',read:true,write:false},native:{}})
		
		//Check ever 3 secs
		adapter.log.info("starting Polling every " + adapter.config.PollingInterval + " ms");
		setInterval(function() {
			e2.getResponse('GETSTANDBY',		e2.PATH['POWERSTATE'],		e2.evaluateCommandResponse);
			
			e2.getResponse('MESSAGEANSWER', 	e2.PATH['MESSAGEANSWER'],  	e2.evaluateCommandResponse);
			e2.getResponse('GETINFO',    		e2.PATH['ABOUT'],       		e2.evaluateCommandResponse);
			e2.getResponse('GETVOLUME',  		e2.PATH['VOLUME'],      		e2.evaluateCommandResponse);
			e2.getResponse('GETCURRENT', 		e2.PATH['GET_CURRENT'], 		e2.evaluateCommandResponse);
			e2.checkEnigmalight();
		}, adapter.config.PollingInterval);

		setInterval(function() {
			if (e2.isConnected) {
				e2.getResponse('DEVICEINFO_HDD', e2.PATH['DEVICEINFO'],  e2.evaluateCommandResponse);
			}
		}, 30000);
	}
	
	this.checkEnigmalight = function() {
		if(adapter.config.PortEnigma > 0)
		{
			e2.getResponse('ENIGMALIGHT', '', function(e2, command, httpstatus, pageData) {
				adapter.setState('enigma2.ENIGMALIGHT_ENABLED', httpstatus);
				
				if(httpstatus)
				{
					e2.getResponse('ENIGMALIGHT', '/api/statusinfo', function(e2, command, httpstatus, pageData) {
						adapter.setState('enigma2.ENIGMALIGHT_LIGHTSON', (JSON.parse(pageData).lights_onoff.toLowerCase() == 'off' ? false : true));
					});
				}
			});
		}
	}
	
	this.getResponse = function(command, path, callback, cbdata){
		var e2 = this;
		var options = {
			host:				adapter.config.IPAddress,
			port:				(command == 'ENIGMALIGHT' ? adapter.config.PortEnigma : adapter.config.PortWebIf),
			TimerCheck:			adapter.config.TimerCheck,
			path:				path,
			method:				'GET'
		};

		adapter.log.debug("creating request for command '"+command+"' (deviceId: "+e2.deviceId+", host: "+options.host+", port: "+options.port+", path: '"+options.path+"')");

		if (typeof adapter.config.Username != 'undefined' && typeof adapter.config.Password != 'undefined') {
			if (adapter.config.Username.length > 0 && adapter.config.Password.length > 0) {
				options.headers = {
					'Authorization': 'Basic ' + new Buffer(adapter.config.Username + ':' + adapter.config.Password).toString('base64')
				}
				adapter.log.debug("using authorization with user '"+adapter.config.Username+"'");
			} else {
				adapter.log.debug("using no authorization");
			}
		}

		var req = http.get(options, function(res) {
			const { statusCode } = res;
			var pageData = "";
			
			if(command === 'PICON')
			{
				res.setEncoding('base64');

				var pageData = "data:" + res.headers["content-type"] + ";base64,";
			}
			else
			{
				res.setEncoding('utf8');

				if (statusCode == 200) {
					e2.setStatus(true);
				}
			}
				
			res.on('data', function (chunk) {
				pageData += chunk
			});
			res.on('end', function () {
				if(command == 'PICON' || command == 'ENIGMALIGHT')
				{
					if (callback) {
						callback (e2, command, (statusCode == '200' && pageData.length > 0 ? true : false), pageData, cbdata);
					}
				}
				else
				{
					var parser = new xml2js.Parser();
					parser.parseString(pageData, function (err, result) {
						if (callback) {
							callback (e2, command, result, cbdata);
						}
					});
				}
			});
		});
		req.on('error', function(e) {
			e2.setStatus(false);
			adapter.log.debug("received error: "+e.message+" Box eventuell nicht erreichbar?");
			return;
		});
	}
	
	this.timer = function()
	{
	}
	
	this.setStatus = function(status)
	{
		if(status != this.isConnected)
		{
			this.isConnected = status;
			if (this.isConnected) {
				adapter.log.info("enigma2 Verbunden!");
				adapter.setState('enigma2-CONNECTION', true, true );
				this.getResponse('GETSTANDBY',		this.PATH['POWERSTATE'],		this.evaluateCommandResponse);
				this.getResponse('MESSAGEANSWER', 	this.PATH['MESSAGEANSWER'],  	this.evaluateCommandResponse);
				this.getResponse('GETINFO',    		this.PATH['ABOUT'],       		this.evaluateCommandResponse);
				this.getResponse('GETVOLUME',  		this.PATH['VOLUME'],      		this.evaluateCommandResponse);
				this.getResponse('GETCURRENT', 		this.PATH['GET_CURRENT'], 		this.evaluateCommandResponse);
				this.getResponse('SERVICELIST', 	this.PATH['SERVICELIST'], 		this.evaluateCommandResponse);
			} else {
				adapter.log.info("enigma2: " + adapter.config.IPAddress + ":" + adapter.config.Port + " ist nicht erreichbar!");
				adapter.setState('enigma2-CONNECTION', false, true );
				// Werte aus Adapter loeschen
				adapter.setState('enigma2.BOX_IP', "" );
				adapter.setState('enigma2.CHANNEL', "" );
				adapter.setState('enigma2.CHANNEL_PICON', "" );
				adapter.setState('enigma2.CHANNEL_SERVICEREFERENCE', "" );
				adapter.setState('enigma2.EVENTDESCRIPTION', "" );
				adapter.setState('enigma2.EVENTDURATION', "" );
				adapter.setState('enigma2.EVENTREMAINING', "" );
				adapter.setState('enigma2.MESSAGE_ANSWER', "" );
				adapter.setState('enigma2.MODEL', "" );
				adapter.setState('enigma2.MUTED', "" );
				adapter.setState('enigma2.NETWORK', "" );
				adapter.setState('enigma2.PROGRAMM', "" );
				adapter.setState('enigma2.PROGRAMM_AFTER', "" );
				adapter.setState('enigma2.PROGRAMM_AFTER_INFO', "" );
				adapter.setState('enigma2.PROGRAMM_INFO', "" );
				adapter.setState('enigma2.STANDBY', false, true );
				adapter.setState('enigma2.VOLUME', "" );
				adapter.setState('enigma2.WEB_IF_VERSION', "" );
				adapter.setState('Message.MESSAGE_ANSWER', false, true );
			}
		}
	}
	
	this.evaluateCommandResponse = function(t, command, xml)
	{
		adapter.log.debug("evaluating response for command '"+command+"': "+JSON.stringify(xml));

		var bool;
		
		switch (command.toUpperCase())
		{
			case "MESSAGE":
			case "MESSAGETEXT":
			case "MESSAGEANSWER":
				adapter.log.debug("message answer: " +xml.e2simplexmlresult.e2statetext[0]);			
				adapter.setState('enigma2.MESSAGE_ANSWER', {val: xml.e2simplexmlresult.e2statetext[0], ack: true});
				break;			
			case "RESTART":
			case "REBOOT":
			case "DEEPSTANDBY":
				//setState(boxId, "");
				break;
			case "MUTE":
			case "UNMUTE":
			case "MUTE_TOGGLE":
			case "VOLUME":
			case "SET_VOLUME":
				adapter.setState('enigma2.COMMAND', {val: '', ack: true});		
				break;
			case "WAKEUP":
			case "STANDBY":
			case "OFF":
			case 'STANDBY_TOGGLE':
				break;
			case "GETSTANDBY":
				adapter.log.debug("Box Standby: " + t.parseBool(xml.e2powerstate.e2instandby));
				adapter.setState('enigma2.STANDBY', {val: t.parseBool(xml.e2powerstate.e2instandby), ack: true});
				break;
			case "GETVOLUME":
				if (!xml.e2volume || !xml.e2volume.e2current) {
					adapter.log.error('No e2volume found');
					return;
				}
				adapter.log.debug("Box Volume:" + parseInt(xml.e2volume.e2current[0]));
				adapter.setState('enigma2.VOLUME', {val: parseInt(xml.e2volume.e2current[0]), ack: true});
				adapter.log.debug("Box Muted:" + t.parseBool(xml.e2volume.e2ismuted));
				adapter.setState('enigma2.MUTED', {val: t.parseBool(xml.e2volume.e2ismuted), ack: true});
				break;
			case "GETCURRENT":
				// Check Sender Picon
				var picon = xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventservicereference[0].replace(/:/g, '_').replace(/_$/, '');
				t.getResponse('PICON', "/picon/" +picon +"."+t.piconext, t.setPIcon);
			
				adapter.log.debug("Box EVENTDURATION:" + parseInt(xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventduration[0]));
				adapter.setState('enigma2.EVENTDURATION', {val: parseInt(xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventduration[0]), ack: true});
				adapter.log.debug("Box EVENTREMAINING:" + parseInt(xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventremaining[0]));
				adapter.setState('enigma2.EVENTREMAINING', {val: parseInt(xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventremaining[0]), ack: true});
				adapter.log.debug("Box Programm: " +xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventname[0]);			
				adapter.setState('enigma2.PROGRAMM', {val: xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventname[0], ack: true});
				adapter.log.debug("Box Programm_danach: " +xml.e2currentserviceinformation.e2eventlist[0].e2event[1].e2eventname[0]);			
				adapter.setState('enigma2.PROGRAMM_AFTER', {val: xml.e2currentserviceinformation.e2eventlist[0].e2event[1].e2eventname[0], ack: true});
				adapter.log.debug("Box Programm Info: " +xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventdescriptionextended[0]);			
				adapter.setState('enigma2.PROGRAMM_INFO', {val: xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventdescriptionextended[0], ack: true});
				adapter.log.debug("Box Programm danach Info: " +xml.e2currentserviceinformation.e2eventlist[0].e2event[1].e2eventdescriptionextended[0]);			
				adapter.setState('enigma2.PROGRAMM_AFTER_INFO', {val: xml.e2currentserviceinformation.e2eventlist[0].e2event[1].e2eventdescriptionextended[0], ack: true});			
				adapter.log.debug("Box eventdescription: " +xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventdescription[0]);			
				adapter.setState('enigma2.EVENTDESCRIPTION', {val: xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventdescription[0], ack: true});
				adapter.log.debug("Box Sender Servicereference: " +xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventservicereference[0]);			
				adapter.setState('enigma2.CHANNEL_SERVICEREFERENCE', {val: xml.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventservicereference[0], ack: true});
				break;
			case "GETINFO":
				adapter.log.debug("Box Sender: " +xml.e2abouts.e2about[0].e2servicename[0]);
				adapter.setState('enigma2.CHANNEL', {val: xml.e2abouts.e2about[0].e2servicename[0], ack: true});
				//adapter.log.debug("Box Model: " +xml.e2abouts.e2about[0].e2model[0]);
				//adapter.setState('enigma2.MODEL', {val: xml.e2abouts.e2about[0].e2model[0], ack: true});
				break;
			case "DEVICEINFO":
				adapter.setState('enigma2.WEB_IF_VERSION', {val: xml.e2deviceinfo.e2webifversion[0], ack: true});
				adapter.setState('enigma2.NETWORK', {val: xml.e2deviceinfo.e2network[0].e2interface[0].e2name[0], ack: true});
				adapter.setState('enigma2.BOX_IP', {val: xml.e2deviceinfo.e2network[0].e2interface[0].e2ip[0], ack: true});
				adapter.setState('enigma2.MODEL', {val: xml.e2deviceinfo.e2devicename[0], ack: true});
				 break;
			case "DEVICEINFO_HDD":
				if(xml.e2deviceinfo.e2hdds[0].e2hdd !== undefined){
				
					adapter.setObject('enigma2.HDD_CAPACITY', {
						type: 'state',
						common: {
							type: 'string',
							role: 'state',
							name: 'maximal Flash Capacity (Flash 1)',
							read:  true,
							write: false
						},
						native: {}
					});
					adapter.setObject('enigma2.HDD_FREE', {
						type: 'state',
						common: {
							type: 'string',
							role: 'state',
							name: 'free Flash Capacity (Flash 1)',
							read:  true,
							write: false
						},
						native: {}
					});
					
					adapter.setState('enigma2.HDD_CAPACITY', {val: xml.e2deviceinfo.e2hdds[0].e2hdd[0].e2capacity[0], ack: true});
					adapter.setState('enigma2.HDD_FREE', {val: xml.e2deviceinfo.e2hdds[0].e2hdd[0].e2free[0], ack: true});
					if(xml.e2deviceinfo.e2hdds[0].e2hdd[1] !== undefined){
					
						adapter.setObject('enigma2.HDD2_CAPACITY', {
							type: 'state',
							common: {
								type: 'string',
								role: 'state',
								name: 'maximal Flash Capacity (Flash 2)',
								read:  true,
								write: false
							},
							native: {}
						});
						adapter.setObject('enigma2.HDD2_FREE', {
							type: 'state',
							common: {
								type: 'string',
								role: 'state',
								name: 'free Flash Capacity (Flash 2)',
								read:  true,
								write: false
							},
							native: {}
						});

						adapter.setState('enigma2.HDD2_CAPACITY', {val: xml.e2deviceinfo.e2hdds[0].e2hdd[1].e2capacity[0], ack: true});
						adapter.setState('enigma2.HDD2_FREE', {val: xml.e2deviceinfo.e2hdds[0].e2hdd[1].e2free[0], ack: true});
					} else {
						adapter.delObject('enigma2.HDD2_CAPACITY');
						adapter.delObject('enigma2.HDD2_FREE');
					};
				} else {
					adapter.delObject('enigma2.HDD2_CAPACITY');
					adapter.delObject('enigma2.HDD2_FREE');
					adapter.delObject('enigma2.HDD_CAPACITY');
					adapter.delObject('enigma2.HDD_FREE');
				}
			
				break;
			case "SERVICELIST":
				adapter.delObject('Bouquets');
				
				if(xml.e2servicelistrecursive.e2bouquet !== undefined)
				{
					for (t.e2bouquetidx = 0; t.e2bouquetidx < xml.e2servicelistrecursive.e2bouquet.length; t.e2bouquetidx++)
					{
						adapter.setObject('Bouquets.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicename[0], {
							type: 'channel',
							common: {},
							native: {}
						});
						
						for (t.e2serviceidx = 0; t.e2serviceidx < xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicelist[0].e2service.length; t.e2serviceidx++)
						{
							adapter.setObject('Bouquets.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicename[0] + '.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicelist[0].e2service[t.e2serviceidx].e2servicename[0], {
								type: 'channel',
								common: {},
								native: {}
							});
							
							adapter.setObject('Bouquets.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicename[0] + '.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicelist[0].e2service[t.e2serviceidx].e2servicename[0] + '.Servicename', {
								type: 'state',
								common: {
									type: 	'string',
									role: 	'text',
									read:  	true,
									write: 	true
								},
								native: {}
							});
							adapter.setState('Bouquets.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicename[0] + '.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicelist[0].e2service[t.e2serviceidx].e2servicename[0] + '.Servicename', {val: xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicelist[0].e2service[t.e2serviceidx].e2servicename[0], ack: true});
							adapter.setObject('Bouquets.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicename[0] + '.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicelist[0].e2service[t.e2serviceidx].e2servicename[0] + '.Servicereference', {
								type: 'state',
								common: {
									type: 	'string',
									role: 	'text',
									read:  	true,
									write: 	true
								},
								native: {}
							});
							adapter.setState('Bouquets.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicename[0] + '.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicelist[0].e2service[t.e2serviceidx].e2servicename[0] + '.Servicereference', {val: xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicelist[0].e2service[t.e2serviceidx].e2servicereference[0], ack: true});
							
							var picon = xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicelist[0].e2service[t.e2serviceidx].e2servicereference[0].replace(/:/g, '_').replace(/_$/, '');
							
							var data = new respData();
							
							data.addData('state', 'Bouquets.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicename[0] + '.' + xml.e2servicelistrecursive.e2bouquet[t.e2bouquetidx].e2servicelist[0].e2service[t.e2serviceidx].e2servicename[0] + '.Servicepicon');
							
							t.getResponse('PICON', "/picon/" +picon +"."+t.piconext, t.setPIcon, data);
						}
					}
				}
				break;
			case "VOLUME_UP":
			case "VOLUME_DOWN":
			case "LEFT":
			case "RIGHT":
			case "UP":
			case "DOWN":
			case "EXIT":
			case "CH_UP":
			case "CH_DOWN":
			case "SELECT":
			case "OK":
			case "BOUQUET_UP":
			case "BOUQUET_DOWN":
			case "INFO":
			case "MENU":
				//setState(boxId, "");
			default:
				adapter.log.info("received unknown command '"+command+"' @ evaluateCommandResponse");
		}
	}
	
	this.stateChange = function(id, state)
	{
		var parts 	= id.split('.');
		var name 	= parts.pop();
		var e2 		= this;
			
		adapter.getObject(id, function (err, obj) {
			var val = state.val;
			if(obj.common && typeof obj.common.def !== 'undefined' && (obj.common.def > 0 || obj.common.def.length > 0))
				val = obj.common.def;
						
			adapter.log.info('obj.common.def: ' + obj.common.def);
			adapter.log.info('val: ' + obj.common.def);
			adapter.log.info('name: ' + name);
			
			switch (name.toUpperCase())
			{
				case 'ENIGMALIGHT_LIGHTSONOFF':
					adapter.getState('enigma2.ENIGMALIGHT_LIGHTSON', function(err, state) {
						e2.getResponse('ENIGMALIGHT', '/control/light?set=' + (state.val == true ? 'off' : 'on' ), function (e2, command, httpstatus, result) {
							e2.checkEnigmalight();
						});
					});
					break;
				default:
					e2.getResponse('NONE', '/web/remotecontrol?command=' + val + '&rcu=advanced', function (e2, command, result) {
						if (result.e2remotecontrol.e2result != "TRUE") adapter.log.error('Cannot send command "/web/remotecontrol?command=' + val + '&rcu=advanced": ' + result.e2remotecontrol.e2resulttext);
					});
					break;
			}
		});
		
		return;
		
		if (id && state && !state.ack) {
			var parts = id.split('.');
			var name = parts.pop();

			if (id === adapter.namespace + '.Message.Type') {
				adapter.log.debug('Info Message Type: ' + state.val);
				adapter.setState('Message.Type', {val: state.val, ack: true});
			} else
			if (id === adapter.namespace + '.Message.Timeout') {
				adapter.log.debug('Info Message Timeout: ' + state.val + 's');
				adapter.setState('Message.Timeout', {val: state.val, ack: true});
			}

			if (this.commands[name]) {
				getResponse('NONE', this.PATH['REMOTE_CONTROL'] + this.commands[name] + '&rcu=advanced', respData, function (error, command, xml) {
					if (error) {
						//adapter.log.error('Cannot send command "' + name + '": ' + error);
					}
				});
			} else
			if (id === adapter.namespace + '.Timer.Update') {
				getResponse('TIMERLIST', this.PATH['TIMERLIST'], respData, TimerSearch);
				adapter.log.debug("Timer manuell aktualisiert");
				//adapter.setState('Timer.Update', {val: state.val, ack: true});

			} else
			if (id === adapter.namespace + '.enigma2.Update') {
				getResponse('GETSTANDBY', this.PATH['POWERSTATE'],  respData, evaluateCommandResponse);
				getResponse('MESSAGEANSWER', this.PATH['MESSAGEANSWER'],  respData, evaluateCommandResponse);
				getResponse('GETINFO',    this.PATH['ABOUT'],       respData, evaluateCommandResponse);
				getResponse('GETVOLUME',  this.PATH['VOLUME'],      respData, evaluateCommandResponse);
				getResponse('GETCURRENT', this.PATH['GET_CURRENT'], respData, evaluateCommandResponse);
				adapter.log.debug("E2 States manuell aktualisiert");
				adapter.setState('enigma2.Update', {val: state.val, ack: true});

			} else
			if (id === adapter.namespace + '.enigma2.STANDBY') {
				getResponse('GETSTANDBY', this.PATH['POWERSTATE'],  respData, evaluateCommandResponse);
				getResponse('NONE', this.PATH['POWERSTATE'] + '?newstate=' + (state.val ? 1 : 0), respData, function (error, command, xml) {
					if (!error) {
						adapter.setState('enigma2.STANDBY', state.val, true);
					} else {
						adapter.setState('enigma2.STANDBY', {val: state.val, ack: true});
					}
				});
			} else if (id === adapter.namespace + '.command.SET_VOLUME') {
				getResponse('NONE', this.PATH['VOLUME_SET'] + parseInt(state.val, 10), respData, function (error, command, xml) {
					if (!error) {
						adapter.setState('command.SET_VOLUME', {val: '', ack: true});
					} else {
						adapter.setState('command.SET_VOLUME', {val: state.val, ack: true});
						getResponse('GETVOLUME', this.PATH['VOLUME'], respData, evaluateCommandResponse);
					}
				});
			} else if (id === adapter.namespace + '.command.REMOTE-CONTROL') {
				adapter.log.debug('Its our Command: ' + state.val);
				getResponse('NONE', this.PATH['REMOTE_CONTROL'] + state.val + '&rcu=advanced' , respData, function (error, command, xml) {
					if (!error) {
						adapter.setState('command.REMOTE-CONTROL', state.val, true);
					} else {
						adapter.setState('command.REMOTE-CONTROL', {val: state.val, ack: true});
					}
				});
			} else if (id === adapter.namespace + '.Message.Text') {
				adapter.log.debug('Info message: ' + state.val);
				var MESSAGE_TEXT  = state.val;

				adapter.getState('Message.Type', function(err, state) {
					adapter.log.debug('Info Message Type: ' + state.val);
					var MESSAGE_TYPE  = state.val;

					adapter.getState('Message.Timeout', function(err, state) {
						adapter.log.debug('Info Message Type: ' + state.val);
						var MESSAGE_TIMEOUT  = state.val;

						getResponse('NONE', this.PATH['MESSAGE'] + encodeURIComponent(MESSAGE_TEXT) + '&type=' + MESSAGE_TYPE + '&timeout=' + MESSAGE_TIMEOUT, respData, function (error, command, xml) {
							if (!error) {
								adapter.setState('Message.Text', MESSAGE_TEXT, true);
							} else {
								adapter.setState('Message.Text', {val: MESSAGE_TEXT, ack: true});
							}
						});
					});
				});
			} else if (parts[1] === 'Timer' && name === 'Timer_Toggle') {
				var timerID = parts[2];
				
				adapter.getState('Timer.'+timerID+'.Timer_servicereference', function(err, state) {
					var T_sRef  = state.val;
					adapter.getState('Timer.'+timerID+'.Timer_Start', function(err, state) {
						var T_begin  = state.val;
						adapter.getState('Timer.'+timerID+'.Timer_End', function(err, state) {
							var T_end  = state.val;
							getResponse('NONE', this.PATH['TIMER_TOGGLE'] + T_sRef + '&begin=' + T_begin + '&end=' + T_end, respData, function (error, command, xml) {
								if (!error) {
									adapter.setState('Timer.'+timerID+'.Timer_Toggle', state.val, true);
								} else {
									getResponse('TIMERLIST', this.PATH['TIMERLIST'], respData, TimerSearch);
								}
							});
						});
					});
				});
			} else if (parts[1] === 'Timer' && name === 'Delete') {
				var timerID = parts[2];
				
				adapter.getState('Timer.'+timerID+'.Timer_servicereference', function(err, state) {
					var T_sRef  = state.val;
					adapter.getState('Timer.'+timerID+'.Timer_Start', function(err, state) {
						var T_begin  = state.val;
						adapter.getState('Timer.'+timerID+'.Timer_End', function(err, state) {
							var T_end  = state.val;
							getResponse('NONE', this.PATH['DELETE'] + T_sRef + '&begin=' + T_begin + '&end=' + T_end, respData, function (error, command, xml) {
								if (!error) {
									adapter.setState('Timer.'+timerID+'.Delete', state.val, true);
								} else {
									adapter.setState('Timer.'+timerID+'.Delete', {val: state.val, ack: true});
									getResponse('TIMERLIST', this.PATH['TIMERLIST'], respData, TimerSearch);
								}
							});
						});
					});
				});
			};
		}
	}
	
	this.setPIcon = function(t, command, exists, base64, data)
	{
		var state = 'enigma2.CHANNEL_PICON';
		if(data instanceof respData && data.getData('state') !== undefined) state = data.getData('state');
		
		if(exists)
		{		
			adapter.log.debug("Box Sender "+ state +" picon: " + base64);
			
			adapter.setObjectNotExists(state, {
				type: 'state',
				common: {
					type: 	'string',
					role: 	'text',
					name: 	state,
					read:  	true,
					write: 	true
				},
				native: {}
			});
			
			adapter.setState(state, {val: base64, ack: true});
		}
	}
	
	this.parseBool = function(string){
		var cleanedString = string[0].replace(/(\t\n|\n|\t)/gm,"");
		switch(cleanedString.toLowerCase()){
			case "true":
			case "yes":
			case "1": 
				return true;
			default:
				return false;
		}
	}
}

var e2 = new enigma2();



adapter.on('stateChange', function (id, state) {
	e2.stateChange(id, state);
});

adapter.on('ready', function () {
	// in this example all states changes inside the adapters namespace are subscribed
	adapter.subscribeStates('command.*');
	
	e2.init();
});
