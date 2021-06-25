package webwork3;
use Mojo::Base 'Mojolicious', -signatures;

use Mojo::File qw(curfile);

my $webwork_root = curfile->dirname->sibling('lib')->to_string;

use Data::Dump qw/dd/;
use Try::Tiny;

use DB::Schema;


my $handle_exception = sub ($next, $controller) {
	## only test requests that start with "/api"
	if ($controller->req->url->to_string =~ /\/api/) {
		try {
			$next->();
		} catch {
			$controller->render(json => {msg => "oops!", exception => ref($_)});
		};
	} else {
		$next->();
	}
};

# This method will run once at server start
sub startup ($self) {

	# Load configuration from config file
	my $config = $self->plugin('NotYAMLConfig');

	# Configure the application
	$self->secrets($config->{secrets});

	## get the dbix plugin loaded

	my $schema = DB::Schema->connect("dbi:SQLite:dbname=$webwork_root/../t/db/sample_db.sqlite");

	$self->plugin('DBIC',{schema => $schema});

	# load the authentication plugin

	$self->plugin(
		Authentication => {
				load_user     => sub ($app, $uid) { $self->load_account($uid) },
				validate_user => sub ($c, $u, $p, $e) { $self->validate($u, $p) ? $u : () },
		}
	);

	## handle all api route exceptions
	$self->hook( around_dispatch => $handle_exception );

	## load all routes
	$self->loginRoutes();
	$self->coursesRoutes();
	$self->userRoutes();
	$self->courseUserRoutes();
	$self->problemSetRoutes();

}




sub load_account {
	my ($self,$user_id)  = @_;
	my $user = $self->schema->resultset("User")->getGlobalUser({email => $user_id});
	return $user->{user_id};
}

sub validate {
	my ($self,$user,$password) = @_;
	return $self->schema->resultset("User")->authenticate($user,$password);
}

sub loginRoutes {
	my $self = shift;

	# Normal route to controller
	$self->routes->get('/login')->to('Login#login_page');
	$self->routes->get('/login/help')->to('Login#login_help');
	$self->routes->get('/users/start')->to('Login#user_courses');
	$self->routes->post('/login')->to('Login#check_login');
	$self->routes->get('/logout')->to('Login#logout_page');
}

sub coursesRoutes {
	my $self = shift;
	my $course_routes = $self->routes->any('/api/courses')->to(controller => 'Course');
	$course_routes->get('/')->to(action => 'getCourses');
	$course_routes->get('/:course_id')->to(action => 'getCourse');
  $course_routes->put('/:course_id')->to(action => 'updateCourse');
	$course_routes->post('/')->to(action => 'addCourse');
	$course_routes->delete('/:course_id')->to(action => 'deleteCourse');
}

sub userRoutes {
	my $self = shift;
	my $course_routes = $self->routes->any('/api/users')->to(controller => 'User');
	$course_routes->get('/')->to(action => 'getGlobalUsers');
	$course_routes->post('/')->to(action => 'addGlobalUser');
	$course_routes->get('/:user_id')->to(action => 'getGlobalUser');
	$course_routes->put('/:user_id')->to(action => 'updateGlobalUser');
	$course_routes->delete('/:user_id')->to(action => 'deleteGlobalUser');
}

sub courseUserRoutes {
	my $self = shift;
	my $course_user_routes = $self->routes->any('/api/courses/:course_id/users')->to(controller =>'User');
	$course_user_routes->get('/')->to(action => 'getUsers');
	$course_user_routes->post('/')->to(action => 'addUser');
	$course_user_routes->get('/:user_id')->to(action => 'getUser');
	$course_user_routes->put('/:user_id')->to(action => 'updateUser');
	$course_user_routes->delete('/:user_id')->to(action => 'deleteUser');

}

sub problemSetRoutes {
	my $self = shift;
	$self->routes->get('/api/sets')->to("ProblemSet#getProblemSets");
	my $course_routes = $self->routes->any('/api/courses/:course_id/sets')->to(controller => 'ProblemSet');
	$course_routes->get('/')->to(action => 'getProblemSets');
	$course_routes->get('/:set_id')->to(action => 'getProblemSet');
  $course_routes->put('/:set_id')->to(action => 'updateProblemSet');
	$course_routes->post('/')->to(action => 'addProblemSet');
	$course_routes->delete('/:set_id')->to(action => 'deleteProblemSet');
}


1;
