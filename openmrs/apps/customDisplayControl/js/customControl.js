'use strict';

angular.module('bahmni.common.displaycontrol.custom')
    .directive('birthCertificate', ['observationsService', 'appService', 'spinner', function (observationsService, appService, spinner) {
        var link = function ($scope) {
            console.log("inside birth certificate");
            var conceptNames = ["HEIGHT"];
            $scope.contentUrl = appService.configBaseUrl() + "/customDisplayControl/views/birthCertificate.html";
            spinner.forPromise(observationsService.fetch($scope.patient.uuid, conceptNames, "latest", undefined, $scope.visitUuid, undefined).then(function (response) {
                $scope.observations = response.data;
            }));
        };

        return {
            restrict: 'E',
            template: '<ng-include src="contentUrl"/>',
            link: link
        }
    }]).directive('deathCertificate', ['observationsService', 'appService', 'spinner', function (observationsService, appService, spinner) {
    var link = function ($scope) {
        var conceptNames = ["WEIGHT"];
        $scope.contentUrl = appService.configBaseUrl() + "/customDisplayControl/views/deathCertificate.html";
        spinner.forPromise(observationsService.fetch($scope.patient.uuid, conceptNames, "latest", undefined, $scope.visitUuid, undefined).then(function (response) {
            $scope.observations = response.data;
        }));
    };

    return {
        restrict: 'E',
        link: link,
        template: '<ng-include src="contentUrl"/>'
    }
}]).directive('customTreatmentChart', ['appService', 'treatmentConfig', 'TreatmentService', 'spinner', '$q', function (appService, treatmentConfig, treatmentService, spinner, $q) {
    var link = function ($scope) {
        var Constants = Bahmni.Clinical.Constants;
        var days = [
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday'
        ];
        $scope.contentUrl = appService.configBaseUrl() + "/customDisplayControl/views/customTreatmentChart.html";

        $scope.atLeastOneDrugForDay = function (day) {
            var atLeastOneDrugForDay = false;
            $scope.ipdDrugOrders.getIPDDrugs().forEach(function (drug) {
                if (drug.isActiveOnDate(day.date)) {
                    atLeastOneDrugForDay = true;
                }
            });
            return atLeastOneDrugForDay;
        };

        $scope.getVisitStopDateTime = function () {
            return $scope.visitSummary.stopDateTime || Bahmni.Common.Util.DateUtil.now();
        };

        $scope.getStatusOnDate = function (drug, date) {
            var activeDrugOrders = _.filter(drug.orders, function (order) {
                if ($scope.config.frequenciesToBeHandled.indexOf(order.getFrequency()) !== -1) {
                    return getStatusBasedOnFrequency(order, date);
                } else {
                    return drug.getStatusOnDate(date) === 'active';
                }
            });
            if (activeDrugOrders.length === 0) {
                return 'inactive';
            }
            if (_.every(activeDrugOrders, function (order) {
                    return order.getStatusOnDate(date) === 'stopped';
                })) {
                return 'stopped';
            }
            return 'active';
        };

        var getStatusBasedOnFrequency = function (order, date) {
            var activeBetweenDate = order.isActiveOnDate(date);
            var frequencies = order.getFrequency().split(",").map(function (day) {
                return day.trim();
            });
            var dayNumber = moment(date).day();
            return activeBetweenDate && frequencies.indexOf(days[dayNumber]) !== -1;
        };

        var init = function () {
            var getToDate = function () {
                return $scope.visitSummary.stopDateTime || Bahmni.Common.Util.DateUtil.now();
            };

            var programConfig = appService.getAppDescriptor().getConfigValue("program") || {};

            var startDate = null, endDate = null, getEffectiveOrdersOnly = false;
            if (programConfig.showDetailsWithinDateRange) {
                startDate = $stateParams.dateEnrolled;
                endDate = $stateParams.dateCompleted;
                if (startDate || endDate) {
                    $scope.config.showOtherActive = false;
                }
                getEffectiveOrdersOnly = true;
            }

            return $q.all([treatmentConfig(), treatmentService.getPrescribedAndActiveDrugOrders($scope.config.patientUuid, $scope.config.numberOfVisits,
                $scope.config.showOtherActive, $scope.config.visitUuids || [], startDate, endDate, getEffectiveOrdersOnly)])
                .then(function (results) {
                    var config = results[0];
                    var drugOrderResponse = results[1].data;
                    var createDrugOrderViewModel = function (drugOrder) {
                        return Bahmni.Clinical.DrugOrderViewModel.createFromContract(drugOrder, config);
                    };
                    for (var key in drugOrderResponse) {
                        drugOrderResponse[key] = drugOrderResponse[key].map(createDrugOrderViewModel);
                    }

                    var groupedByVisit = _.groupBy(drugOrderResponse.visitDrugOrders, function (drugOrder) {
                        return drugOrder.visit.startDateTime;
                    });
                    var treatmentSections = [];

                    for (var key in groupedByVisit) {
                        var values = Bahmni.Clinical.DrugOrder.Util.mergeContinuousTreatments(groupedByVisit[key]);
                        treatmentSections.push({visitDate: key, drugOrders: values});
                    }
                    if (!_.isEmpty(drugOrderResponse[Constants.otherActiveDrugOrders])) {
                        var mergedOtherActiveDrugOrders = Bahmni.Clinical.DrugOrder.Util.mergeContinuousTreatments(drugOrderResponse[Constants.otherActiveDrugOrders]);
                        treatmentSections.push({
                            visitDate: Constants.otherActiveDrugOrders,
                            drugOrders: mergedOtherActiveDrugOrders
                        });
                    }
                    $scope.treatmentSections = treatmentSections;
                    if ($scope.visitSummary) {
                        $scope.ipdDrugOrders = Bahmni.Clinical.VisitDrugOrder.createFromDrugOrders(drugOrderResponse.visitDrugOrders, $scope.visitSummary.startDateTime, getToDate());
                    }
                });
        };
        spinner.forPromise(init());
    };

    return {
        restrict: 'E',
        link: link,
        scope: {
            config: "=",
            visitSummary: '='
        },
        template: '<ng-include src="contentUrl"/>'
    }
}]).directive('patientAppointmentsDashboard', ['$http', '$q', '$window','appService', function ($http, $q, $window, appService) {
    var link = function ($scope) {
        $scope.contentUrl = appService.configBaseUrl() + "/customDisplayControl/views/patientAppointmentsDashboard.html";
        var getUpcomingAppointments = function () {
            var params = {
                q: "bahmni.sqlGet.upComingAppointments",
                v: "full",
                patientUuid: $scope.patient.uuid
            };
            return $http.get('/openmrs/ws/rest/v1/bahmnicore/sql', {
                method: "GET",
                params: params,
                withCredentials: true
            });
        };
        var getPastAppointments = function () {
            var params = {
                q: "bahmni.sqlGet.pastAppointments",
                v: "full",
                patientUuid: $scope.patient.uuid
            };
            return $http.get('/openmrs/ws/rest/v1/bahmnicore/sql', {
                method: "GET",
                params: params,
                withCredentials: true
            });
        };
        $q.all([getUpcomingAppointments(), getPastAppointments()]).then(function (response) {
            $scope.upcomingAppointments = response[0].data;
            $scope.upcomingAppointmentsHeadings = _.keys($scope.upcomingAppointments[0]);
            $scope.pastAppointments = response[1].data;
            $scope.pastAppointmentsHeadings = _.keys($scope.pastAppointments[0]);
        });

        $scope.goToListView = function () {
            $window.open('/bahmni/appointments/#/home/manage/appointments/list');
        };
    };
    return {
        restrict: 'E',
        link: link,
        scope: {
            patient: "=",
            section: "="
        },
        template: '<ng-include src="contentUrl"/>'
    };
}]).directive('openHealthAlgorithms', ['$http', '$q','appService', 'spinner', 'observationsService', 'conditionsService',
    function ($http, $q, appService, spinner, observationsService, conditionsService) {
        var link = function ($scope) {
            $scope.contentUrl = appService.configBaseUrl() + "/customDisplayControl/views/openHealthAlgorithms.html";
            $scope.oha = {
                hasDiabetes: false,
                isCurrentSmoker: false,
                sbp: 100,
                age: $scope.patient.age,
                totalCholesterol: 5.2,
                cholesterolUnit: "mmol/l"
            };

            var conditions = ["asthma", "tuberculosis"];
         conditionsService.getConditions($scope.patient.uuid).then(function (patientConditions) {
            var diabeticConditions= patientConditions.filter(function (condition) {
               return condition.concept.name.match(/diabetes/gi).length>0
            });
             if(diabeticConditions && diabeticConditions.length>0){
                 $scope.oha.hasDiabetes  = true;
             }
            });


             console.log($scope.patient);
            $scope.request = {
                "API_KEY": "NWFhMzBkMWMzNWM2Nw==",
                "ALGORITHM_ID": "5aa30d1c35cb2",
                "data": {
                    "request": {
                        "api_key": "4325872943oeqitrqet7",
                        "api_secret": "3459823jfweureitu",
                        "request_api": "https://developers.openhealthalgorithms.org/algos/hearts/",
                        "country_code": "D",
                        "response_type": "COMPLETE"
                    },
                    "body": {
                        "region": "AFRD",
                        "demographics": {
                            "gender": $scope.patient.gender,
                            "age": $scope.oha.age,
                            "occupation": "office_worker",
                            "monthly_income": ""
                        },
                        "measurements": {
                            "height": [
                                1.5,
                                "m"
                            ],
                            "weight": [
                                70,
                                "kg"
                            ],
                            "waist": [
                                99,
                                "cm"
                            ],
                            "hip": [
                                104,
                                "cm"
                            ],
                            "sbp": [
                                $scope.oha.sbp  ,
                                "sitting"
                            ],
                            "dbp": [
                                110,
                                "sitting"
                            ]
                        },
                        "smoking": {
                            "current": $scope.oha.isCurrentSmoker ? 1 : 0,
                            "ex_smoker": 1,
                            "quit_within_year": 0
                        },
                        "physical_activity": "120",
                        "diet_history": {
                            "fruit": 1,
                            "veg": 6,
                            "rice": 2,
                            "oil": "olive"
                        },
                        "medical_history": {
                            "conditions": conditions
                        },
                        "allergies": {},
                        "medications": [
                            "anti_hypertensive",
                            "statin",
                            "antiplatelet",
                            "bronchodilator"
                        ],
                        "family_history": [
                            "cvd"
                        ],
                        "pathology": {
                            "bsl": {
                                "type": "random",
                                "units": "mg/dl",
                                "value": 80
                            },
                            "cholesterol": {
                                "type": "fasting",
                                "units": "mmol/l",
                                "total_chol": 12,
                                "hdl": 10,
                                "ldl": 24
                            }
                        }
                    }
                }
            };
            $scope.noObs = false;

            var getValueByName = function( obs, name){
                var foundObs = obs.filter(function (item) {
                    return item.conceptNameToDisplay == name
                })[0];
                if(foundObs){
                    return foundObs.value;
                }

            }

            var conceptNames = ["Systolic BP","Diastolic BP","Current","Follow Up Interval"];
            var requestConceptNames = ["Height","Weight","Hip","Waist","BSL Value","Systolic BP","Diastolic BP","CVD Risk","Guidelines, Follow Up Message",
              "HDL","LDL","Current","Guidelines, Follow Up Interval","Total Cholesterol", "Lifestyle Management", "Lipids Management", "BP Management", "Referral"];
            spinner.forPromise(observationsService.fetch($scope.patient.uuid, requestConceptNames, "latest", undefined, $scope.visitUuid, undefined).then(function (response) {
                var observations = response.data;
                if (observations.length == 0) {
                    console.log("No previous obs,Use default values");
                    $scope.noObs = true;
                } else {

                    $scope.calculatedRisk =   getValueByName(observations,'Risk');
                    $scope.calculatedMessage = getValueByName(observations,'Follow Up Message');
                    if($scope.calculatedRisk ){
                        $scope.cvdRisk = $scope.calculatedRisk;
                    }

                    $scope.height = getValueByName(observations,'Height');
                    if( $scope.height){
                        $scope.request.data.body.measurements.height[0] = $scope.height;
                    }
                    $scope.weight = getValueByName(observations,'Weight');
                    if( $scope.weight){
                        $scope.request.data.body.measurements.weight[0] = $scope.weight;
                    }
                    $scope.hip = getValueByName(observations,'Hip');
                    if( $scope.hip){
                        $scope.request.data.body.measurements.hip[0] = $scope.hip;
                    }
                    $scope.waist = getValueByName(observations,'Waist');
                    if( $scope.waist){
                        $scope.request.data.body.measurements.waist[0] = $scope.waist;
                    }
                    $scope.bsl = getValueByName(observations,'BSL Value');
                    if( $scope.bsl){
                        $scope.request.data.body.pathology.bsl.value = $scope.bsl;
                    }

                    $scope.dbp = getValueByName(observations,'Diastolic BP');
                    if( $scope.dbp){
                        $scope.request.data.body.measurements.dbp[0] = $scope.weight;
                    }
                    $scope.smoker = getValueByName(observations,'Current');
                    if( $scope.smoker){
                        $scope.oha.isCurrentSmoker = $scope.smoker;
                    }
                    $scope.sbp = getValueByName(observations,'Systolic BP');
                    if( $scope.sbp){
                        $scope.oha.sbp = $scope.sbp;
                        $scope.request.data.body.measurements.sbp[0]=$scope.sbp;
                    }
                    $scope.tc = getValueByName(observations,'Total Cholesterol');
                    if( $scope.tc){
                        $scope.oha.totalCholesterol = $scope.tc;
                        $scope.request.data.body.pathology.cholesterol.total_chol = $scope.tc;

                    }

                    var lipidsManagement = getValueByName(observations, 'Lipids Management');
                    var bpManagement = getValueByName(observations, 'BP Management');
                    var lifestyleManagement = getValueByName(observations, 'Lifestyle Management');
                    var referralManagement = getValueByName(observations, 'Referral');

                    var management = {};
                    var cvdAdvice = [];

                    if (lipidsManagement) {
                        management['lipids'] = lipidsManagement;
                        cvdAdvice.push('lipids');
                    }
                    if (bpManagement) {
                        management['blood-pressure'] = bpManagement;
                        cvdAdvice.push('blood-pressure');
                    }
                    if (lifestyleManagement) {
                        management['lifestyle'] = lifestyleManagement;
                        cvdAdvice.push('lifestyle');
                    }
                    if (referralManagement) {
                        management['referral'] = referralManagement;
                        cvdAdvice.push('referral');
                    }

                    if (cvdAdvice.length > 0){
                        var followUp = getValueByName(observations, 'Follow Up Interval');
                        $scope.cvdAdvice = cvdAdvice;
                        $scope.management = management;
                        $scope.cvdFollowUP = followUp != undefined ? followUp : 3;
                    }


                    $scope.groupedObs = _.groupBy(observations, "encounterDateTime");
                    $scope.dates = Object.keys($scope.groupedObs).reverse();

                    $scope.followUpInterval = 12;
                    if ($scope.dates && $scope.dates.length > 0) {
                        var followup = $scope.groupedObs[$scope.dates[0]].filter(function (item) {
                            return item.conceptNameToDisplay == "Follow Up Interval"
                        })[0];
                        $scope.followUpInterval = followup ? followup.value : 12;
                        $scope.reviewDate = parseInt($scope.dates[0]) + $scope.followUpInterval * 30 * 24 * 3600 * 1000;
                    }


                    console.log($scope.reviewDate);

                }


            }));

            //
            // spinner.forPromise(observationsService.fetch($scope.patient.uuid, conceptNames, "latest", undefined, $scope.visitUuid, undefined).then(function (response) {
            //     var observations = response.data;
            //     $scope.groupedObs = _.groupBy(observations,"encounterDateTime");
            //     $scope.dates = Object.keys($scope.groupedObs).reverse();
            //     $scope.smoking = [];
            //     $scope.sbp = [];
            //     $scope.dbp = [];
            //     $scope.followUpInterval=12;
            //     if($scope.dates && $scope.dates.length > 0){
            //         $scope.followUpInterval = $scope.groupedObs[$scope.dates[0]].filter(function(item){ return item.conceptNameToDisplay == "Follow Up Interval" })[0].value;
            //         $scope.reviewDate = parseInt($scope.dates[0])+$scope.followUpInterval*30*24*3600*1000;
            //     }
            //
            //     for(var i =0;i<$scope.dates.length;i++){
            //         $scope.smoking.push($scope.groupedObs[$scope.dates[i]].filter(function(item){ return item.conceptNameToDisplay == "Current" })[0].value);
            //         $scope.sbp.push($scope.groupedObs[$scope.dates[i]].filter(function(item){ return item.conceptNameToDisplay == "Systolic BP" })[0].value);
            //         $scope.dbp.push($scope.groupedObs[$scope.dates[i]].filter(function(item){ return item.conceptNameToDisplay == "Diastolic BP" })[0].value);
            //     }
            //     console.log($scope.reviewDate);
            //
            // }));

            var getCVDRisk = function () {

                if ($scope.oha.hasDiabetes) {
                    conditions.push("diabetes");
                }


                $scope.request.data.body.pathology.cholesterol.total_chol = $scope.oha.totalCholesterol;
                $scope.request.data.body.smoking.current =  $scope.oha.isCurrentSmoker ? 1 : 0;
                $scope.request.data.body.demographics.age  = $scope.oha.age;

                $scope.request.data.body.medical_history.conditions = conditions;
                return $http.post('https://cors-anywhere.herokuapp.com/https://developer.openhealthalgorithms.org/api/openhealth/demo/hearts',
                    $scope.request ,
                    {headers: {'Access-Control-Allow-Origin': '*'}}
                );

            };
            var requestConceptNames = [];

            // $scope.mapCarePlans = function (data) {
            //     var carePlan={};
            //     if(data.cvd_assessment.guidelines && data.cvd_assessment.guidelines.advice && data.cvd_assessment.guidelines.advice.length>0 ){
            //         var advices= data.cvd_assessment.guidelines.advice;
            //         for(var i=0;i<advices.length;i++){
            //
            //         }
            //         //
            //         // var carePlan = {
            //         //    "title" =
            //         //     Item.value =
            //         //         item. target =
            //         //             Item.recommendation
            //         // Item.follow-up-interval = 3
            //         // Item.follow-up-unit = months
            //         // Item.referred = true / false
            //         // Item.referred.location =
            //         //     Item.referral.program = [sms message bank, application end-point]
            //         // Item.next_assessment_date = [calculated]
            //
            //     };
            //     }
            // };



            $scope.calculateHearts = function () {
                spinner.forPromise(getCVDRisk().then(function (response) {
                    var data = response.data;

                    $scope.cvdRisk = data.cvd_assessment.cvd_risk_result ? data.cvd_assessment.cvd_risk_result.risk: 0;
                    $scope.diabeteseRisk = data.diabetes ? data.diabetes.value : 0;
                    $scope.diabeteseAdvice = data.diabetes.output ? data.diabetes.output[3]? data.diabetes.output[3]:"No Advice" : "No Advice";
                    $scope.smokingAdvice = data.lifestyle.smoking.output ? data.lifestyle.smoking.output[3]? data.lifestyle.smoking.output[3]:"No Advice" : "No Advice";


                    if ($scope.cvdFollowUP === undefined || $scope.cvdFollowUP === null) {
                        $scope.cvdFollowUP = data.cvd_assessment.guidelines ? data.cvd_assessment.guidelines.follow_up_interval : 3;
                    }

                    if ($scope.cvdAdvice === undefined || $scope.cvdAdvice === null) {
                        $scope.cvdAdvice = data.cvd_assessment.guidelines ? data.cvd_assessment.guidelines.advice : "No Followup";
                    }

                    if ($scope.management === undefined || $scope.management === null) {
                      $scope.management = data.cvd_assessment.guidelines ? data.cvd_assessment.guidelines.management : {};
                    }

                }));
            }
        };
        return {
            restrict: 'E',
            link: link,
            scope: {
                patient: "=",
                section: "="
            },
            template: '<ng-include src="contentUrl"/>'
        };
    }]);
